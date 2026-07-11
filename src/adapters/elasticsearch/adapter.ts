import type {
  Adapter, AdapterFactory, ExecuteOptions,
  ItemKind, ResolvedConnection, ResultEnvelope, SchemaItem, TreeNode,
} from '../types'
import type { Client } from '@elastic/elasticsearch'
import { offsetFromToken } from '../../core/pagination'

// tree node ids: 'es:' + dot-joined segments, each escaped so names with dots survive
export function esNodeId(...parts: string[]): string {
  return 'es:' + parts.map(p => encodeURIComponent(p).replace(/\./g, '%2E')).join('.')
}

export function parseEsNodeId(id: string): string[] {
  return id.slice(3).split('.').map(decodeURIComponent)
}

// `<METHOD> <path> [<json body>]`, Kibana-console style. Body must be valid JSON.
const REQUEST = /^\s*(GET|POST|PUT|DELETE|HEAD|PATCH)\s+(\S+)\s*([\s\S]*)$/i
export function parseEs(stmt: string): { method: string; path: string; body?: unknown } {
  const s = stmt.trim().replace(/;+\s*$/, '')
  const m = REQUEST.exec(s)
  if (!m) throw new Error('expected <METHOD> <path> [json body] — e.g. GET /crew/_search {"query":{"match_all":{}}}')
  const path = m[2].startsWith('/') ? m[2] : `/${m[2]}`
  const bodyText = m[3].trim()
  let body: unknown
  if (bodyText) {
    try { body = JSON.parse(bodyText) } catch { throw new Error('request body must be valid JSON') }
  }
  return { method: m[1].toUpperCase(), path, body }
}

const cell = (v: unknown): unknown =>
  v !== null && typeof v === 'object' ? JSON.stringify(v) : v

// union of top-level keys across the page, each object a row
function docsToRows(docs: Record<string, unknown>[]): { columns: { name: string }[]; rows: unknown[][] } {
  const keys: string[] = []
  const seen = new Set<string>()
  for (const d of docs) {
    for (const k of Object.keys(d)) if (!seen.has(k)) { seen.add(k); keys.push(k) }
  }
  return { columns: keys.map(name => ({ name })), rows: docs.map(d => keys.map(k => cell(d[k]))) }
}

interface SearchResponse { hits?: { hits?: { _id: string; _score: number | null; _source?: Record<string, unknown> }[] } }

class ElasticsearchAdapter implements Adapter {
  readonly id = 'elasticsearch'
  private client: Client | undefined

  constructor(private cfg: ResolvedConnection) {}

  private async getClient(): Promise<Client> {
    if (!this.client) {
      const { Client } = await import('@elastic/elasticsearch')   // lazy: driver loads on first connect
      const scheme = this.cfg.tls === true ? 'https' : 'http'
      this.client = new Client({
        node: `${scheme}://${String(this.cfg.host)}:${Number(this.cfg.port ?? 9200)}`,
        ...(this.cfg.auth === true
          ? { auth: { username: String(this.cfg.user ?? ''), password: this.cfg.secrets.password ?? '' } }
          : {}),
        ...(this.cfg.tls === true ? { tls: { rejectUnauthorized: false } } : {}),
        requestTimeout: 30000,
      })
    }
    return this.client
  }

  private async request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const client = await this.getClient()
    return client.transport.request<T>({ method, path, body: body as never })
  }

  async connect(cfg: ResolvedConnection) {
    await this.testConnection(cfg)
  }

  async testConnection(cfg: ResolvedConnection) {
    this.cfg = cfg
    await this.request('GET', '/_cluster/health')
  }

  async execute(stmt: string, opts: ExecuteOptions): Promise<ResultEnvelope> {
    const { method, path, body } = parseEs(stmt)
    const started = Date.now()
    const isSearch = /\/_search\b/.test(path)
    let reqBody = body
    let offset = 0
    let paginated = false
    // page _search by injecting from/size when the body doesn't set them itself
    if (isSearch) {
      const b = { ...((body as Record<string, unknown>) ?? {}) }
      if (b.size === undefined && b.from === undefined) {
        offset = offsetFromToken(opts.pageToken)
        b.from = offset
        b.size = opts.pageSize + 1
        paginated = true
      }
      reqBody = b
    }
    const res = await this.request(method, path, reqBody)
    const done = (columns: { name: string }[], rows: unknown[][], warnings: string[] = [], next?: string): ResultEnvelope =>
      ({ columns, rows, rowCount: rows.length, elapsedMs: Date.now() - started, warnings, ...(next ? { nextPageToken: next } : {}) })

    const hits = (res as SearchResponse)?.hits?.hits
    if (isSearch && Array.isArray(hits)) {
      const docs = hits.map(h => ({ _id: h._id, _score: h._score, ...(h._source ?? {}) }))
      const hasMore = paginated && docs.length > opts.pageSize
      const { columns, rows } = docsToRows(hasMore ? docs.slice(0, opts.pageSize) : docs)
      return done(columns, rows, [], hasMore ? String(offset + opts.pageSize) : undefined)
    }
    if (Array.isArray(res)) {
      const objs = res.filter((x): x is Record<string, unknown> => x !== null && typeof x === 'object')
      const rest = res.length - objs.length
      const { columns, rows } = docsToRows(objs)
      return done(columns.length ? columns : [{ name: 'value' }], columns.length ? rows : res.map(v => [cell(v)]),
        rest > 0 ? [`${rest} non-object row(s) omitted`] : [])
    }
    // object or scalar response (writes, _cluster/*, _mapping, …) — show the JSON
    return done([{ name: 'result' }], [[typeof res === 'string' ? res : JSON.stringify(res)]])
  }

  async getChildren(node: TreeNode | null): Promise<TreeNode[]> {
    if (node === null) {
      const rows = await this.request<{ index: string }[]>('GET', '/_cat/indices?format=json&h=index')
      return rows
        .map(r => r.index)
        .filter(name => name && !name.startsWith('.'))
        .sort()
        .map(name => ({ id: esNodeId(name), label: name, kind: 'table', hasChildren: true }))
    }
    if (node.kind === 'table') {
      const [index] = parseEsNodeId(node.id)
      const res = await this.request<Record<string, { mappings?: { properties?: Record<string, { type?: string }> } }>>('GET', `/${index}/_mapping`)
      const props = res[index]?.mappings?.properties ?? {}
      return Object.entries(props).map(([field, def]) => ({
        id: esNodeId(index, field), label: field, kind: 'column', hasChildren: false, detail: def?.type,
      }))
    }
    return []
  }

  async searchItems(kind: ItemKind, prefix: string): Promise<SchemaItem[]> {
    if (kind === 'table') {
      const rows = await this.request<{ index: string }[]>('GET', '/_cat/indices?format=json&h=index')
      return rows
        .map(r => r.index)
        .filter(name => name && !name.startsWith('.') && name.startsWith(prefix))
        .slice(0, 50)
        .map(name => ({ kind: 'table', name }))
    }
    if (kind === 'column') {
      const res = await this.request<Record<string, { mappings?: { properties?: Record<string, { type?: string }> } }>>('GET', '/_all/_mapping')
      const out: SchemaItem[] = []
      const seen = new Set<string>()
      for (const [index, def] of Object.entries(res)) {
        if (index.startsWith('.')) continue
        for (const [field, fdef] of Object.entries(def?.mappings?.properties ?? {})) {
          if (field.startsWith(prefix) && !seen.has(field)) {
            seen.add(field)
            out.push({ kind: 'column', name: field, parent: index, detail: fdef?.type })
          }
          if (out.length >= 100) return out
        }
      }
      return out
    }
    return []
  }

  async dispose() {
    await this.client?.close()
    this.client = undefined
  }
}

export const elasticsearchFactory: AdapterFactory = {
  id: 'elasticsearch',
  validate(raw) {
    return typeof raw.host === 'string' && raw.host !== '' ? [] : ['host is required']
  },
  requiredSecrets(cfg) {
    return cfg.auth === true ? ['password'] : []
  },
  create(cfg) {
    return new ElasticsearchAdapter(cfg)
  },
}
