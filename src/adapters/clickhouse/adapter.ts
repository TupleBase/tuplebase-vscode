import type {
  Adapter, AdapterFactory, ExecuteOptions,
  ItemKind, ResolvedConnection, ResultEnvelope, SchemaItem, TreeNode,
} from '../types'
import type { ClickHouseClient } from '@clickhouse/client'
import { offsetFromToken, windowedSql } from '../../core/pagination'

// ClickHouse system databases hidden from the tree (mirrors postgres hiding pg_catalog)
const SYSTEM_DBS = ['system', 'INFORMATION_SCHEMA', 'information_schema']
const SYSTEM_DB_LIST = SYSTEM_DBS.map(d => `'${d}'`).join(', ')

// statements that return a result set (everything else runs as a command)
const READ = /^\s*(select|with|show|desc|describe|explain|exists|values|table)\b/i

// tree node ids: 'ch:' + dot-joined segments, each escaped so names with dots survive
export function chNodeId(...parts: string[]): string {
  return 'ch:' + parts.map(p => encodeURIComponent(p).replace(/\./g, '%2E')).join('.')
}

export function parseChNodeId(id: string): string[] {
  return id.slice(3).split('.').map(decodeURIComponent)
}

// Array/Map/Tuple/nested types come back as JS arrays/objects in JSONCompact;
// stringify non-scalars for the grid, pass scalars (incl. Int64-as-string) through.
const cell = (v: unknown): unknown =>
  v !== null && typeof v === 'object' ? JSON.stringify(v) : v

interface JsonCompact { meta: { name: string; type: string }[]; data: unknown[][] }

class ClickHouseAdapter implements Adapter {
  readonly id = 'clickhouse'
  private client: ClickHouseClient | undefined

  constructor(private cfg: ResolvedConnection) {}

  private async getClient(): Promise<ClickHouseClient> {
    if (!this.client) {
      const { createClient } = await import('@clickhouse/client')   // lazy: driver loads on first connect
      this.client = createClient({
        url: `http://${String(this.cfg.host)}:${Number(this.cfg.port ?? 8123)}`,
        username: String(this.cfg.user ?? 'default'),
        password: this.cfg.secrets.password ?? '',
        database: String(this.cfg.database ?? 'default'),
        request_timeout: 30000,
      })
    }
    return this.client
  }

  async connect(cfg: ResolvedConnection) {
    await this.testConnection(cfg)
  }

  async testConnection(cfg: ResolvedConnection) {
    this.cfg = cfg
    const client = await this.getClient()
    const rs = await client.query({ query: 'SELECT 1', format: 'JSONCompact' })
    await rs.json()
  }

  // small object-row query for schema browsing / completion
  private async rows(query: string, query_params?: Record<string, unknown>): Promise<Record<string, unknown>[]> {
    const client = await this.getClient()
    const rs = await client.query({ query, format: 'JSONEachRow', query_params })
    return rs.json() as Promise<Record<string, unknown>[]>
  }

  async execute(stmt: string, opts: ExecuteOptions): Promise<ResultEnvelope> {
    const client = await this.getClient()
    const started = Date.now()
    if (!READ.test(stmt)) {
      // write / DDL — no result set
      await client.command({ query: stmt, abort_signal: opts.signal })
      return { columns: [], rows: [], rowCount: 0, elapsedMs: Date.now() - started, warnings: ['ok'] }
    }
    const offset = offsetFromToken(opts.pageToken)
    const page = windowedSql(stmt, opts.pageSize, offset)
    const rs = await client.query({ query: page.sql, format: 'JSONCompact', abort_signal: opts.signal })
    const { meta, data } = await rs.json() as JsonCompact
    const columns = meta.map(m => ({ name: m.name, type: m.type }))
    let rows = data.map(r => r.map(cell))
    if (page.paginated) {
      const hasMore = rows.length > opts.pageSize
      if (hasMore) rows = rows.slice(0, opts.pageSize)
      return {
        columns, rows, rowCount: rows.length, elapsedMs: Date.now() - started, warnings: [],
        ...(hasMore ? { nextPageToken: String(offset + opts.pageSize) } : {}),
      }
    }
    const warnings: string[] = []
    if (rows.length > opts.pageSize) {
      warnings.push(`showing first ${opts.pageSize} of ${rows.length} rows`)
      rows = rows.slice(0, opts.pageSize)
    }
    return { columns, rows, rowCount: rows.length, elapsedMs: Date.now() - started, warnings }
  }

  async getChildren(node: TreeNode | null): Promise<TreeNode[]> {
    if (node === null) {
      const r = await this.rows(
        `select name from system.databases where name not in (${SYSTEM_DB_LIST}) order by name`,
      )
      return r.map(row => ({ id: chNodeId(String(row.name)), label: String(row.name), kind: 'schema', hasChildren: true }))
    }
    if (node.kind === 'schema') {
      const [db] = parseChNodeId(node.id)
      const r = await this.rows('select name from system.tables where database = {db:String} order by name', { db })
      return r.map(row => ({ id: chNodeId(db, String(row.name)), label: String(row.name), kind: 'table', hasChildren: true }))
    }
    if (node.kind === 'table') {
      const [db, table] = parseChNodeId(node.id)
      const r = await this.rows(
        'select name, type from system.columns where database = {db:String} and table = {t:String} order by position',
        { db, t: table },
      )
      return r.map(row => ({
        id: chNodeId(db, table, String(row.name)), label: String(row.name),
        kind: 'column', hasChildren: false, detail: row.type ? String(row.type) : undefined,
      }))
    }
    return []
  }

  async searchItems(kind: ItemKind, prefix: string): Promise<SchemaItem[]> {
    if (kind === 'table') {
      const r = await this.rows(
        `select database, name from system.tables where database not in (${SYSTEM_DB_LIST})
         and name like {p:String} order by name limit 50`, { p: `${prefix}%` },
      )
      return r.map(row => ({ kind: 'table', name: String(row.name), parent: String(row.database) }))
    }
    if (kind === 'column') {
      const r = await this.rows(
        `select table, name, type from system.columns where database not in (${SYSTEM_DB_LIST})
         and name like {p:String} order by name limit 100`, { p: `${prefix}%` },
      )
      return r.map(row => ({ kind: 'column', name: String(row.name), parent: String(row.table), detail: row.type ? String(row.type) : undefined }))
    }
    return []
  }

  async dispose() {
    await this.client?.close()
    this.client = undefined
  }
}

export const clickhouseFactory: AdapterFactory = {
  id: 'clickhouse',
  validate(raw) {
    const errs: string[] = []
    for (const f of ['host', 'database', 'user']) {
      if (typeof raw[f] !== 'string' || raw[f] === '') errs.push(`${f} is required`)
    }
    return errs
  },
  requiredSecrets(cfg) {
    return cfg.auth === true ? ['password'] : []
  },
  create(cfg) {
    return new ClickHouseAdapter(cfg)
  },
}
