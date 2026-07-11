import { readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import type {
  Adapter, AdapterFactory, ExecuteOptions,
  ItemKind, ResolvedConnection, ResultEnvelope, SchemaItem, TreeNode,
} from '../types'
import { offsetFromToken, windowedSql } from '../../core/pagination'

type SqlJsStatic = import('sql.js').SqlJsStatic
type Database = import('sql.js').Database
type SqlValue = import('sql.js').SqlValue

// sql.js (asm.js build) is loaded once per process and shared across connections.
let sqlJsPromise: Promise<SqlJsStatic> | undefined
function getSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJsPromise) sqlJsPromise = import('sql.js/dist/sql-asm.js').then(m => m.default())
  return sqlJsPromise
}

// tree node ids: 'sq:' + dot-joined segments, each escaped so names with dots survive
export function sqNodeId(...parts: string[]): string {
  return 'sq:' + parts.map(p => encodeURIComponent(p).replace(/\./g, '%2E')).join('.')
}

export function parseSqNodeId(id: string): string[] {
  return id.slice(3).split('.').map(decodeURIComponent)
}

// Resolve the database file path. Absolute paths pass through; a relative path is
// resolved against the .rowboat.json directory (baseDir) so config paths are
// relative to the config file, not the (unpredictable) extension-host cwd.
export function resolveDbPath(cfg: { path?: unknown; baseDir?: string }): string {
  const p = String(cfg.path ?? '')
  return isAbsolute(p) ? p : resolve(cfg.baseDir ?? process.cwd(), p)
}

// BLOBs come back as Uint8Array; render them as \x<hex> for the grid, pass the
// rest (number/string/null) through untouched.
const cell = (v: SqlValue): unknown =>
  v instanceof Uint8Array ? `\\x${Buffer.from(v).toString('hex')}` : v

class SQLiteAdapter implements Adapter {
  readonly id = 'sqlite'
  private db: Database | undefined
  private path: string

  constructor(private cfg: ResolvedConnection) {
    this.path = resolveDbPath(cfg)
  }

  private async open(): Promise<Database> {
    if (this.db) return this.db
    const SQL = await getSqlJs()
    let bytes: Buffer
    try {
      bytes = readFileSync(this.path)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`SQLite database file not found: ${this.path}`)
      }
      throw e
    }
    this.db = new SQL.Database(bytes)
    return this.db
  }

  // read all rows of a query as objects (schema browsing / completion — small result sets)
  private query(sql: string, params: SqlValue[] = []): Record<string, SqlValue>[] {
    const stmt = this.db!.prepare(sql, params)
    const cols = stmt.getColumnNames()
    const out: Record<string, SqlValue>[] = []
    try {
      while (stmt.step()) {
        const row = stmt.get()
        const obj: Record<string, SqlValue> = {}
        cols.forEach((c, i) => { obj[c] = row[i] })
        out.push(obj)
      }
    } finally {
      stmt.free()
    }
    return out
  }

  async connect(cfg: ResolvedConnection) {
    await this.testConnection(cfg)
  }

  async testConnection(cfg: ResolvedConnection) {
    this.cfg = cfg
    this.path = resolveDbPath(cfg)
    const db = await this.open()
    db.prepare('select 1').free()   // parse-check the connection is usable
  }

  async execute(stmt: string, opts: ExecuteOptions): Promise<ResultEnvelope> {
    const db = await this.open()
    // sql.js runs synchronously and can't be interrupted mid-statement; honour an
    // already-aborted run, but there is no in-flight cancel for local file queries.
    if (opts.signal.aborted) throw new Error('Query aborted')
    const started = Date.now()
    const offset = offsetFromToken(opts.pageToken)
    const page = windowedSql(stmt, opts.pageSize, offset)
    const prepared = db.prepare(page.sql)
    try {
      const columns = prepared.getColumnNames().map(name => ({ name }))
      if (columns.length === 0) {
        // write (INSERT/UPDATE/DELETE/DDL) — no result columns; run it and persist
        prepared.step()
        const affected = db.getRowsModified()
        writeFileSync(this.path, Buffer.from(db.export()))
        return { columns: [], rows: [], rowCount: affected, elapsedMs: Date.now() - started, warnings: [`ok — ${affected} row(s) affected`] }
      }
      let rows: unknown[][] = []
      while (prepared.step()) rows.push(prepared.get().map(cell))
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
      prepared.free()
    }
  }

  async getChildren(node: TreeNode | null): Promise<TreeNode[]> {
    await this.open()
    if (node === null) {
      // no schemas in SQLite — top level is the user tables (hide sqlite_* internals)
      const r = this.query(
        `select name from sqlite_master where type = 'table'
         and name not like 'sqlite\\_%' escape '\\' order by name`,
      )
      return r.map(row => ({ id: sqNodeId(String(row.name)), label: String(row.name), kind: 'table', hasChildren: true }))
    }
    if (node.kind === 'table') {
      const [table] = parseSqNodeId(node.id)
      const r = this.query('select name, type from pragma_table_info(?)', [table])
      return r.map(row => ({
        id: sqNodeId(table, String(row.name)), label: String(row.name),
        kind: 'column', hasChildren: false, detail: row.type ? String(row.type) : undefined,
      }))
    }
    return []
  }

  async searchItems(kind: ItemKind, prefix: string): Promise<SchemaItem[]> {
    await this.open()
    if (kind === 'table') {
      const r = this.query(
        `select name from sqlite_master where type = 'table'
         and name not like 'sqlite\\_%' escape '\\' and name like ? order by name limit 50`,
        [`${prefix}%`],
      )
      return r.map(row => ({ kind: 'table', name: String(row.name) }))
    }
    if (kind === 'column') {
      const r = this.query(
        `select m.name as tbl, p.name as col, p.type as type
         from sqlite_master m, pragma_table_info(m.name) p
         where m.type = 'table' and p.name like ? order by p.name limit 100`,
        [`${prefix}%`],
      )
      return r.map(row => ({ kind: 'column', name: String(row.col), parent: String(row.tbl), detail: row.type ? String(row.type) : undefined }))
    }
    return []
  }

  async dispose() {
    this.db?.close()
    this.db = undefined
  }
}

export const sqliteFactory: AdapterFactory = {
  id: 'sqlite',
  validate(raw) {
    const errs: string[] = []
    if (typeof raw.path !== 'string' || raw.path === '') errs.push('path is required')
    return errs
  },
  requiredSecrets() {
    return []   // file-based: no password
  },
  create(cfg) {
    return new SQLiteAdapter(cfg)
  },
}
