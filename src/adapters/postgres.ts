import type {
  Adapter, AdapterFactory, ConnectionConfig, ExecuteOptions,
  ItemKind, ResolvedConnection, ResultEnvelope, SchemaItem, TreeNode,
} from './types'
import type { Pool } from 'pg'

class PostgresAdapter implements Adapter {
  readonly id = 'postgres'
  private pool: Pool | undefined

  constructor(private cfg: ResolvedConnection) {}

  private async getPool(): Promise<Pool> {
    if (!this.pool) {
      const { Pool } = await import('pg')   // lazy: driver loads on first connect
      this.pool = new Pool({
        host: String(this.cfg.host),
        port: Number(this.cfg.port ?? 5432),
        database: String(this.cfg.database),
        user: String(this.cfg.user),
        password: this.cfg.secrets.password,
        ssl: this.cfg.ssl === true ? { rejectUnauthorized: false } : undefined,
        max: 3,
        connectionTimeoutMillis: 8000,
      })
    }
    return this.pool
  }

  async connect(cfg: ResolvedConnection) {
    this.cfg = cfg
    await this.testConnection(cfg)
  }

  async testConnection(_cfg: ResolvedConnection) {
    const pool = await this.getPool()
    const client = await pool.connect()
    client.release()
  }

  async execute(stmt: string, opts: ExecuteOptions): Promise<ResultEnvelope> {
    const pool = await this.getPool()
    const client = await pool.connect()
    const started = Date.now()
    const onAbort = () => {
      // pg cancellation: open a second connection and cancel the backend pid
      void (async () => {
        const pid = (client as unknown as { processID?: number }).processID
        if (pid) await pool.query('select pg_cancel_backend($1)', [pid]).catch(() => {})
      })()
    }
    opts.signal.addEventListener('abort', onAbort, { once: true })
    try {
      const res = await client.query({ text: stmt, rowMode: 'array' })
      const warnings: string[] = []
      let rows = (res.rows ?? []) as unknown[][]
      if (rows.length > opts.pageSize) {
        warnings.push(`showing first ${opts.pageSize} of ${rows.length} rows`)
        rows = rows.slice(0, opts.pageSize)
      }
      return {
        columns: (res.fields ?? []).map(f => ({ name: f.name, type: String(f.dataTypeID) })),
        rows,
        rowCount: res.rowCount ?? rows.length,
        elapsedMs: Date.now() - started,
        warnings,
      }
    } finally {
      opts.signal.removeEventListener('abort', onAbort)
      client.release()
    }
  }

  async getChildren(node: TreeNode | null): Promise<TreeNode[]> {
    const pool = await this.getPool()
    if (node === null) {
      const r = await pool.query(
        `select schema_name from information_schema.schemata
         where schema_name not in ('pg_catalog','information_schema') order by 1`
      )
      return r.rows.map(row => ({
        id: `pg:${row.schema_name}`, label: row.schema_name, kind: 'schema', hasChildren: true,
      }))
    }
    if (node.kind === 'schema') {
      const schema = node.id.slice(3)
      const r = await pool.query(
        'select table_name from information_schema.tables where table_schema = $1 order by 1', [schema]
      )
      return r.rows.map(row => ({
        id: `${node.id}.${row.table_name}`, label: row.table_name, kind: 'table', hasChildren: true,
      }))
    }
    if (node.kind === 'table') {
      const [schema, table] = node.id.slice(3).split('.')
      const r = await pool.query(
        `select column_name, data_type from information_schema.columns
         where table_schema = $1 and table_name = $2 order by ordinal_position`, [schema, table]
      )
      return r.rows.map(row => ({
        id: `${node.id}.${row.column_name}`, label: row.column_name,
        kind: 'column', hasChildren: false, detail: row.data_type,
      }))
    }
    return []
  }

  async searchItems(kind: ItemKind, prefix: string): Promise<SchemaItem[]> {
    const pool = await this.getPool()
    if (kind === 'table') {
      const r = await pool.query(
        `select table_schema, table_name from information_schema.tables
         where table_schema not in ('pg_catalog','information_schema') and table_name ilike $1 || '%'
         order by 2 limit 50`, [prefix]
      )
      return r.rows.map(row => ({ kind: 'table', name: row.table_name, parent: row.table_schema }))
    }
    if (kind === 'column') {
      const r = await pool.query(
        `select table_name, column_name, data_type from information_schema.columns
         where table_schema not in ('pg_catalog','information_schema') and column_name ilike $1 || '%'
         order by 2 limit 100`, [prefix]
      )
      return r.rows.map(row => ({ kind: 'column', name: row.column_name, parent: row.table_name, detail: row.data_type }))
    }
    return []
  }

  async dispose() {
    await this.pool?.end()
    this.pool = undefined
  }
}

export const postgresFactory: AdapterFactory = {
  id: 'postgres',
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
    return new PostgresAdapter(cfg)
  },
}
