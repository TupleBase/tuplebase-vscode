import type {
  Adapter, AdapterFactory, ExecuteOptions,
  ItemKind, ResolvedConnection, ResultEnvelope, SchemaItem, TreeNode,
} from '../types'
import type { Driver } from 'neo4j-driver'
import { offsetFromToken } from '../../core/pagination'

// neo4j-driver module (holds isInt); cached after first lazy import.
type Neo4jModule = typeof import('neo4j-driver')
let neo4jMod: Neo4jModule | undefined

// tree node ids: 'nj:' + dot-joined segments, each escaped so names with dots survive
export function njNodeId(...parts: string[]): string {
  return 'nj:' + parts.map(p => encodeURIComponent(p).replace(/\./g, '%2E')).join('.')
}

export function parseNjNodeId(id: string): string[] {
  return id.slice(3).split('.').map(decodeURIComponent)
}

// neo4j returns 64-bit ints as Integer objects, nodes/relationships/paths as
// structured objects, temporals/points as objects. Keep scalars raw; render
// Integers as their numeric string and everything else as JSON (ints inside too).
function cell(v: unknown): unknown {
  if (v === null || v === undefined) return v
  if (neo4jMod?.isInt(v)) return v.toString()
  if (typeof v !== 'object') return v
  if (v instanceof Date) return v.toISOString()
  return JSON.stringify(v, (_k, val) => (neo4jMod?.isInt(val) ? val.toString() : val))
}

// only append SKIP/LIMIT to a read that projects rows and doesn't already page
const READ_CYPHER = /^\s*(match|optional\s+match|with|unwind|return|call|show)\b/i
function cypherWindow(stmt: string, pageSize: number, offset: number): { cypher: string; paginated: boolean } {
  const s = stmt.trim().replace(/;+\s*$/, '')
  if (!READ_CYPHER.test(s) || /\blimit\b/i.test(s) || !/\breturn\b/i.test(s)) return { cypher: stmt, paginated: false }
  return { cypher: `${s} SKIP ${offset} LIMIT ${pageSize + 1}`, paginated: true }
}

class Neo4jAdapter implements Adapter {
  readonly id = 'neo4j'
  private driver: Driver | undefined

  constructor(private cfg: ResolvedConnection) {}

  private async getDriver(): Promise<Driver> {
    if (!this.driver) {
      const neo4j = await import('neo4j-driver')   // lazy: driver loads on first connect
      neo4jMod = neo4j
      this.driver = neo4j.driver(
        `bolt://${String(this.cfg.host)}:${Number(this.cfg.port ?? 7687)}`,
        neo4j.auth.basic(String(this.cfg.user ?? 'neo4j'), this.cfg.secrets.password ?? ''),
        { connectionTimeout: 8000 },
      )
    }
    return this.driver
  }

  private get database(): string | undefined {
    return typeof this.cfg.database === 'string' && this.cfg.database !== '' ? this.cfg.database : undefined
  }

  async connect(cfg: ResolvedConnection) {
    await this.testConnection(cfg)
  }

  async testConnection(cfg: ResolvedConnection) {
    this.cfg = cfg
    const driver = await this.getDriver()
    await driver.verifyConnectivity()
  }

  // object-row read for schema browsing / completion
  private async records(cypher: string): Promise<Record<string, unknown>[]> {
    const driver = await this.getDriver()
    const session = driver.session({ database: this.database })
    try {
      const result = await session.run(cypher)
      return result.records.map(rec => rec.toObject())
    } finally {
      await session.close()
    }
  }

  async execute(stmt: string, opts: ExecuteOptions): Promise<ResultEnvelope> {
    const driver = await this.getDriver()
    if (opts.signal.aborted) throw new Error('Query aborted')
    const session = driver.session({ database: this.database })
    const started = Date.now()
    try {
      const offset = offsetFromToken(opts.pageToken)
      const page = cypherWindow(stmt, opts.pageSize, offset)
      const result = await session.run(page.cypher)
      const records = result.records
      if (records.length === 0) {
        const counters = result.summary.counters
        if (counters?.containsUpdates()) {
          const u = counters.updates()
          const changed = Object.entries(u).filter(([, n]) => n > 0).map(([k, n]) => `${k}: ${n}`)
          return { columns: [], rows: [], rowCount: 0, elapsedMs: Date.now() - started, warnings: [`ok — ${changed.join(', ') || 'no changes'}`] }
        }
        return { columns: [], rows: [], rowCount: 0, elapsedMs: Date.now() - started, warnings: [] }
      }
      const keys = records[0].keys as string[]
      const columns = keys.map(name => ({ name }))
      let rows = records.map(rec => keys.map(k => cell(rec.get(k))))
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
    } finally {
      await session.close()
    }
  }

  async getChildren(node: TreeNode | null): Promise<TreeNode[]> {
    if (node === null) {
      // top level = node labels (the closest thing to "tables" in a graph)
      const r = await this.records('CALL db.labels() YIELD label RETURN label ORDER BY label')
      return r.map(row => ({ id: njNodeId(String(row.label)), label: String(row.label), kind: 'table', hasChildren: true }))
    }
    if (node.kind === 'table') {
      const [label] = parseNjNodeId(node.id)
      const r = await this.records('CALL db.schema.nodeTypeProperties()')
      return r
        .filter(row => Array.isArray(row.nodeLabels) && (row.nodeLabels as string[]).includes(label))
        .map(row => ({
          id: njNodeId(label, String(row.propertyName)), label: String(row.propertyName),
          kind: 'column', hasChildren: false,
          detail: Array.isArray(row.propertyTypes) ? (row.propertyTypes as string[]).join(' | ') : undefined,
        }))
    }
    return []
  }

  async searchItems(kind: ItemKind, prefix: string): Promise<SchemaItem[]> {
    if (kind === 'table') {
      const r = await this.records('CALL db.labels() YIELD label RETURN label ORDER BY label')
      return r
        .map(row => String(row.label))
        .filter(name => name.startsWith(prefix))
        .slice(0, 50)
        .map(name => ({ kind: 'table', name }))
    }
    if (kind === 'column') {
      const r = await this.records('CALL db.schema.nodeTypeProperties()')
      const seen = new Set<string>()
      const out: SchemaItem[] = []
      for (const row of r) {
        const name = String(row.propertyName)
        if (!name.startsWith(prefix) || seen.has(name)) continue
        seen.add(name)
        out.push({ kind: 'column', name, detail: Array.isArray(row.propertyTypes) ? (row.propertyTypes as string[]).join(' | ') : undefined })
        if (out.length >= 100) break
      }
      return out
    }
    return []
  }

  async dispose() {
    await this.driver?.close()
    this.driver = undefined
  }
}

export const neo4jFactory: AdapterFactory = {
  id: 'neo4j',
  validate(raw) {
    const errs: string[] = []
    for (const f of ['host', 'user']) {
      if (typeof raw[f] !== 'string' || raw[f] === '') errs.push(`${f} is required`)
    }
    return errs
  },
  requiredSecrets() {
    return ['password']
  },
  create(cfg) {
    return new Neo4jAdapter(cfg)
  },
}
