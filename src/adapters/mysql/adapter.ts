import type {
  Adapter, AdapterFactory, ExecuteOptions,
  ItemKind, ResolvedConnection, ResultEnvelope, SchemaItem, TreeNode,
} from '../types'
import type { Pool, RowDataPacket, FieldPacket } from 'mysql2/promise'
import { offsetFromToken, windowedSql } from '../../core/pagination'

// system schemas are hidden from the tree (mirrors postgres hiding pg_catalog)
const SYSTEM_SCHEMAS = new Set(['information_schema', 'mysql', 'performance_schema', 'sys'])

// tree node ids: 'my:' + dot-joined segments, each escaped so names with dots survive
export function myNodeId(...parts: string[]): string {
  return 'my:' + parts.map(p => encodeURIComponent(p).replace(/\./g, '%2E')).join('.')
}

export function parseMyNodeId(id: string): string[] {
  return id.slice(3).split('.').map(decodeURIComponent)
}

// JSON columns come back from mysql2 as objects; stringify non-scalars for the grid
const cell = (v: unknown): unknown =>
  v !== null && typeof v === 'object' && !(v instanceof Date) && !Buffer.isBuffer(v) ? JSON.stringify(v) : v

class MySQLAdapter implements Adapter {
  readonly id = 'mysql'
  private pool: Pool | undefined

  constructor(private cfg: ResolvedConnection) {}

  private async getPool(): Promise<Pool> {
    if (!this.pool) {
      const mysql = await import('mysql2/promise')   // lazy: driver loads on first connect
      this.pool = mysql.createPool({
        host: String(this.cfg.host),
        port: Number(this.cfg.port ?? 3306),
        database: String(this.cfg.database),
        user: String(this.cfg.user),
        password: this.cfg.secrets.password,
        connectionLimit: 3,
        connectTimeout: 8000,
      })
    }
    return this.pool
  }

  async connect(cfg: ResolvedConnection) {
    await this.testConnection(cfg)
  }

  async testConnection(cfg: ResolvedConnection) {
    this.cfg = cfg
    const pool = await this.getPool()
    const conn = await pool.getConnection()
    try { await conn.ping() } finally { conn.release() }
  }

  async execute(stmt: string, opts: ExecuteOptions): Promise<ResultEnvelope> {
    const pool = await this.getPool()
    const conn = await pool.getConnection()
    const threadId = (conn as unknown as { threadId?: number }).threadId
    const started = Date.now()
    // mysql has no per-connection cancel token — KILL the running query from a
    // second pooled connection when the run is aborted (mirrors pg_cancel_backend)
    const onAbort = () => { if (threadId) void pool.query('KILL QUERY ?', [threadId]).catch(() => {}) }
    opts.signal.addEventListener('abort', onAbort, { once: true })
    try {
      const offset = offsetFromToken(opts.pageToken)
      const page = windowedSql(stmt, opts.pageSize, offset)
      const [result, fields] = await conn.query({ sql: page.sql, rowsAsArray: true }) as [unknown, FieldPacket[]]
      if (!Array.isArray(result)) {
        // write (INSERT/UPDATE/DELETE/DDL) — ResultSetHeader, no rows
        const affected = (result as { affectedRows?: number }).affectedRows ?? 0
        return { columns: [], rows: [], rowCount: affected, elapsedMs: Date.now() - started, warnings: [`ok — ${affected} row(s) affected`] }
      }
      const columns = (fields ?? []).map(f => ({ name: f.name, type: String((f as { columnType?: number }).columnType ?? '') }))
      let rows = (result as unknown[][]).map(r => r.map(cell))
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
      opts.signal.removeEventListener('abort', onAbort)
      conn.release()
    }
  }

  private async rows<T extends RowDataPacket>(sql: string, params: unknown[] = []): Promise<T[]> {
    const pool = await this.getPool()
    const [rows] = await pool.query<T[]>(sql, params)
    return rows
  }

  async getChildren(node: TreeNode | null): Promise<TreeNode[]> {
    if (node === null) {
      const r = await this.rows<RowDataPacket & { name: string }>(
        'select schema_name as name from information_schema.schemata order by 1',
      )
      return r
        .filter(row => !SYSTEM_SCHEMAS.has(row.name))
        .map(row => ({ id: myNodeId(row.name), label: row.name, kind: 'schema', hasChildren: true }))
    }
    if (node.kind === 'schema') {
      const [schema] = parseMyNodeId(node.id)
      const r = await this.rows<RowDataPacket & { name: string }>(
        'select table_name as name from information_schema.tables where table_schema = ? order by 1', [schema],
      )
      return r.map(row => ({ id: myNodeId(schema, row.name), label: row.name, kind: 'table', hasChildren: true }))
    }
    if (node.kind === 'table') {
      const [schema, table] = parseMyNodeId(node.id)
      const r = await this.rows<RowDataPacket & { name: string; type: string }>(
        `select column_name as name, data_type as type from information_schema.columns
         where table_schema = ? and table_name = ? order by ordinal_position`, [schema, table],
      )
      return r.map(row => ({ id: myNodeId(schema, table, row.name), label: row.name, kind: 'column', hasChildren: false, detail: row.type }))
    }
    return []
  }

  async searchItems(kind: ItemKind, prefix: string): Promise<SchemaItem[]> {
    if (kind === 'table') {
      const r = await this.rows<RowDataPacket & { schema: string; name: string }>(
        `select table_schema as \`schema\`, table_name as name from information_schema.tables
         where table_schema not in ('information_schema','mysql','performance_schema','sys')
         and table_name like concat(?, '%') order by 2 limit 50`, [prefix],
      )
      return r.map(row => ({ kind: 'table', name: row.name, parent: row.schema }))
    }
    if (kind === 'column') {
      const r = await this.rows<RowDataPacket & { table: string; name: string; type: string }>(
        `select table_name as \`table\`, column_name as name, data_type as type from information_schema.columns
         where table_schema not in ('information_schema','mysql','performance_schema','sys')
         and column_name like concat(?, '%') order by 2 limit 100`, [prefix],
      )
      return r.map(row => ({ kind: 'column', name: row.name, parent: row.table, detail: row.type }))
    }
    return []
  }

  async dispose() {
    await this.pool?.end()
    this.pool = undefined
  }
}

export const mysqlFactory: AdapterFactory = {
  id: 'mysql',
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
    return new MySQLAdapter(cfg)
  },
}
