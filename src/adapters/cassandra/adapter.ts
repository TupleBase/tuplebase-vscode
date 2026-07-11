import type {
  Adapter, AdapterFactory, ExecuteOptions,
  ItemKind, ResolvedConnection, ResultEnvelope, SchemaItem, TreeNode,
} from '../types'
import type { Client } from 'cassandra-driver'

// keyspaces hidden from the tree (Cassandra's internal schema)
const SYSTEM_KEYSPACES = new Set([
  'system', 'system_schema', 'system_auth', 'system_distributed',
  'system_traces', 'system_views', 'system_virtual_schema',
])

// tree node ids: 'cs:' + dot-joined segments, each escaped so names with dots survive
export function csNodeId(...parts: string[]): string {
  return 'cs:' + parts.map(p => encodeURIComponent(p).replace(/\./g, '%2E')).join('.')
}

export function parseCsNodeId(id: string): string[] {
  return id.slice(3).split('.').map(decodeURIComponent)
}

// Cassandra decodes bigints/uuids/dates/inet to objects with their own toString,
// collections to arrays; blobs are Buffers. Render scalars raw, everything else
// via its string form (falling back to JSON for plain objects).
const cell = (v: unknown): unknown => {
  if (v === null || v === undefined || typeof v !== 'object') return v
  if (Buffer.isBuffer(v)) return `\\x${v.toString('hex')}`
  const s = (v as { toString?: () => string }).toString
  if (typeof s === 'function' && s !== Object.prototype.toString) return s.call(v)
  return JSON.stringify(v)
}

class CassandraAdapter implements Adapter {
  readonly id = 'cassandra'
  private client: Client | undefined

  constructor(private cfg: ResolvedConnection) {}

  private async getClient(): Promise<Client> {
    if (!this.client) {
      const cassandra = await import('cassandra-driver')   // lazy: driver loads on first connect
      const auth = this.cfg.auth === true
      this.client = new cassandra.Client({
        contactPoints: [`${String(this.cfg.host)}:${Number(this.cfg.port ?? 9042)}`],
        localDataCenter: String(this.cfg.datacenter ?? 'datacenter1'),
        ...(typeof this.cfg.keyspace === 'string' && this.cfg.keyspace !== '' ? { keyspace: this.cfg.keyspace } : {}),
        ...(auth
          ? { authProvider: new cassandra.auth.PlainTextAuthProvider(String(this.cfg.user ?? ''), this.cfg.secrets.password ?? '') }
          : {}),
        socketOptions: { connectTimeout: 8000 },
      })
      await this.client.connect()
    }
    return this.client
  }

  async connect(cfg: ResolvedConnection) {
    await this.testConnection(cfg)
  }

  async testConnection(cfg: ResolvedConnection) {
    this.cfg = cfg
    const client = await this.getClient()
    await client.execute('select now() from system.local')
  }

  // small object-row query for schema browsing (system_schema tables are tiny)
  private async rows(cql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
    const client = await this.getClient()
    const result = await client.execute(cql, params, { prepare: false })
    return result.rows as unknown as Record<string, unknown>[]
  }

  async execute(stmt: string, opts: ExecuteOptions): Promise<ResultEnvelope> {
    const client = await this.getClient()
    if (opts.signal.aborted) throw new Error('Query aborted')
    const started = Date.now()
    if (!/^\s*select\b/i.test(stmt)) {
      // write / DDL — no result set
      await client.execute(stmt, [], { prepare: false })
      return { columns: [], rows: [], rowCount: 0, elapsedMs: Date.now() - started, warnings: ['ok'] }
    }
    // Cassandra pages natively: fetchSize bounds the page and pageState is the
    // opaque continuation — a perfect fit for our nextPageToken contract.
    const result = await client.execute(stmt, [], {
      prepare: false, fetchSize: opts.pageSize, ...(opts.pageToken ? { pageState: opts.pageToken } : {}),
    })
    const columns = result.columns.map(c => ({ name: c.name }))
    const rows = result.rows.map(r => r.values().map(cell))
    const next = result.pageState ? String(result.pageState) : undefined
    return {
      columns, rows, rowCount: rows.length, elapsedMs: Date.now() - started, warnings: [],
      ...(next ? { nextPageToken: next } : {}),
    }
  }

  async getChildren(node: TreeNode | null): Promise<TreeNode[]> {
    if (node === null) {
      const r = await this.rows('select keyspace_name from system_schema.keyspaces')
      return r
        .map(row => String(row.keyspace_name))
        .filter(name => !SYSTEM_KEYSPACES.has(name))
        .sort()
        .map(name => ({ id: csNodeId(name), label: name, kind: 'schema', hasChildren: true }))
    }
    if (node.kind === 'schema') {
      const [ks] = parseCsNodeId(node.id)
      const r = await this.rows('select table_name from system_schema.tables where keyspace_name = ?', [ks])
      return r
        .map(row => String(row.table_name)).sort()
        .map(name => ({ id: csNodeId(ks, name), label: name, kind: 'table', hasChildren: true }))
    }
    if (node.kind === 'table') {
      const [ks, table] = parseCsNodeId(node.id)
      const r = await this.rows(
        'select column_name, type from system_schema.columns where keyspace_name = ? and table_name = ?', [ks, table],
      )
      return r.map(row => ({
        id: csNodeId(ks, table, String(row.column_name)), label: String(row.column_name),
        kind: 'column', hasChildren: false, detail: row.type ? String(row.type) : undefined,
      }))
    }
    return []
  }

  async searchItems(kind: ItemKind, prefix: string): Promise<SchemaItem[]> {
    // CQL has no LIKE without a secondary index; system_schema is tiny, so filter client-side
    if (kind === 'table') {
      const r = await this.rows('select keyspace_name, table_name from system_schema.tables')
      return r
        .filter(row => !SYSTEM_KEYSPACES.has(String(row.keyspace_name)) && String(row.table_name).startsWith(prefix))
        .slice(0, 50)
        .map(row => ({ kind: 'table', name: String(row.table_name), parent: String(row.keyspace_name) }))
    }
    if (kind === 'column') {
      const r = await this.rows('select keyspace_name, table_name, column_name, type from system_schema.columns')
      return r
        .filter(row => !SYSTEM_KEYSPACES.has(String(row.keyspace_name)) && String(row.column_name).startsWith(prefix))
        .slice(0, 100)
        .map(row => ({ kind: 'column', name: String(row.column_name), parent: String(row.table_name), detail: row.type ? String(row.type) : undefined }))
    }
    return []
  }

  async dispose() {
    await this.client?.shutdown()
    this.client = undefined
  }
}

export const cassandraFactory: AdapterFactory = {
  id: 'cassandra',
  validate(raw) {
    const errs: string[] = []
    for (const f of ['host', 'datacenter']) {
      if (typeof raw[f] !== 'string' || raw[f] === '') errs.push(`${f} is required`)
    }
    return errs
  },
  requiredSecrets(cfg) {
    return cfg.auth === true ? ['password'] : []
  },
  create(cfg) {
    return new CassandraAdapter(cfg)
  },
}
