import type {
  Adapter, AdapterFactory, ExecuteOptions,
  ItemKind, ResolvedConnection, ResultEnvelope, SchemaItem, TreeNode,
} from '../types'
import type { ConnectionPool } from 'mssql'

// schemas hidden from the tree: sys + the built-in database roles
const SYSTEM_SCHEMAS = new Set([
  'sys', 'INFORMATION_SCHEMA', 'guest', 'db_owner', 'db_accessadmin', 'db_securityadmin',
  'db_ddladmin', 'db_backupoperator', 'db_datareader', 'db_datawriter',
  'db_denydatareader', 'db_denydatawriter',
])
const SYSTEM_SCHEMA_LIST = [...SYSTEM_SCHEMAS].map(s => `'${s}'`).join(', ')

// tree node ids: 'ms:' + dot-joined segments, each escaped so names with dots survive
export function msNodeId(...parts: string[]): string {
  return 'ms:' + parts.map(p => encodeURIComponent(p).replace(/\./g, '%2E')).join('.')
}

export function parseMsNodeId(id: string): string[] {
  return id.slice(3).split('.').map(decodeURIComponent)
}

const cell = (v: unknown): unknown =>
  v !== null && typeof v === 'object' && !(v instanceof Date) && !Buffer.isBuffer(v) ? JSON.stringify(v) : v

class MSSQLAdapter implements Adapter {
  readonly id = 'mssql'
  private pool: ConnectionPool | undefined

  constructor(private cfg: ResolvedConnection) {}

  private async getPool(): Promise<ConnectionPool> {
    if (!this.pool) {
      const mssql = await import('mssql')   // lazy: driver loads on first connect
      const pool = new mssql.ConnectionPool({
        server: String(this.cfg.host),
        port: Number(this.cfg.port ?? 1433),
        database: String(this.cfg.database),
        user: String(this.cfg.user),
        password: this.cfg.secrets.password,
        options: { encrypt: this.cfg.encrypt === true, trustServerCertificate: true },
        pool: { max: 3, min: 0, idleTimeoutMillis: 30000 },
        connectionTimeout: 8000,
        requestTimeout: 30000,
      })
      await pool.connect()
      this.pool = pool
    }
    return this.pool
  }

  async connect(cfg: ResolvedConnection) {
    await this.testConnection(cfg)
  }

  async testConnection(cfg: ResolvedConnection) {
    this.cfg = cfg
    await this.getPool()
  }

  async execute(stmt: string, opts: ExecuteOptions): Promise<ResultEnvelope> {
    const pool = await this.getPool()
    const request = pool.request()
    request.arrayRowMode = true
    const onAbort = () => { try { request.cancel() } catch { /* nothing running */ } }
    opts.signal.addEventListener('abort', onAbort, { once: true })
    const started = Date.now()
    try {
      const result = await request.query(stmt)
      if (!result.recordset) {
        // write / DDL — no result set
        const affected = result.rowsAffected.reduce((a, b) => a + b, 0)
        return { columns: [], rows: [], rowCount: affected, elapsedMs: Date.now() - started, warnings: [`ok — ${affected} row(s) affected`] }
      }
      const colMeta = Object.values(result.recordset.columns).sort((a, b) => a.index - b.index)
      const columns = colMeta.map(c => ({ name: c.name }))
      let rows = (result.recordset as unknown as unknown[][]).map(r => r.map(cell))
      // T-SQL windows with OFFSET/FETCH (which needs ORDER BY), so there is no safe
      // generic pushdown — fetch and slice, warning when the result was truncated.
      const warnings: string[] = []
      if (rows.length > opts.pageSize) {
        warnings.push(`showing first ${opts.pageSize} of ${rows.length} rows`)
        rows = rows.slice(0, opts.pageSize)
      }
      return { columns, rows, rowCount: rows.length, elapsedMs: Date.now() - started, warnings }
    } finally {
      opts.signal.removeEventListener('abort', onAbort)
    }
  }

  private async rows(sql: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>[]> {
    const pool = await this.getPool()
    const request = pool.request()
    for (const [k, v] of Object.entries(params)) request.input(k, v)
    const r = await request.query(sql)
    return r.recordset as unknown as Record<string, unknown>[]
  }

  async getChildren(node: TreeNode | null): Promise<TreeNode[]> {
    if (node === null) {
      const r = await this.rows(
        `select schema_name from information_schema.schemata
         where schema_name not in (${SYSTEM_SCHEMA_LIST}) order by schema_name`,
      )
      return r.map(row => ({ id: msNodeId(String(row.schema_name)), label: String(row.schema_name), kind: 'schema', hasChildren: true }))
    }
    if (node.kind === 'schema') {
      const [schema] = parseMsNodeId(node.id)
      const r = await this.rows(
        `select table_name from information_schema.tables
         where table_schema = @s and table_type = 'BASE TABLE' order by table_name`, { s: schema },
      )
      return r.map(row => ({ id: msNodeId(schema, String(row.table_name)), label: String(row.table_name), kind: 'table', hasChildren: true }))
    }
    if (node.kind === 'table') {
      const [schema, table] = parseMsNodeId(node.id)
      const r = await this.rows(
        `select column_name, data_type from information_schema.columns
         where table_schema = @s and table_name = @t order by ordinal_position`, { s: schema, t: table },
      )
      return r.map(row => ({
        id: msNodeId(schema, table, String(row.column_name)), label: String(row.column_name),
        kind: 'column', hasChildren: false, detail: row.data_type ? String(row.data_type) : undefined,
      }))
    }
    return []
  }

  async searchItems(kind: ItemKind, prefix: string): Promise<SchemaItem[]> {
    if (kind === 'table') {
      const r = await this.rows(
        `select top 50 table_schema, table_name from information_schema.tables
         where table_type = 'BASE TABLE' and table_schema not in (${SYSTEM_SCHEMA_LIST})
         and table_name like @p order by table_name`, { p: `${prefix}%` },
      )
      return r.map(row => ({ kind: 'table', name: String(row.table_name), parent: String(row.table_schema) }))
    }
    if (kind === 'column') {
      const r = await this.rows(
        `select top 100 table_name, column_name, data_type from information_schema.columns
         where table_schema not in (${SYSTEM_SCHEMA_LIST}) and column_name like @p order by column_name`, { p: `${prefix}%` },
      )
      return r.map(row => ({ kind: 'column', name: String(row.column_name), parent: String(row.table_name), detail: row.data_type ? String(row.data_type) : undefined }))
    }
    return []
  }

  async dispose() {
    await this.pool?.close()
    this.pool = undefined
  }
}

export const mssqlFactory: AdapterFactory = {
  id: 'mssql',
  validate(raw) {
    const errs: string[] = []
    for (const f of ['host', 'database', 'user']) {
      if (typeof raw[f] !== 'string' || raw[f] === '') errs.push(`${f} is required`)
    }
    return errs
  },
  requiredSecrets() {
    return ['password']
  },
  create(cfg) {
    return new MSSQLAdapter(cfg)
  },
}
