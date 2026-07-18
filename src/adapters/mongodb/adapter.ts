import type {
  Adapter, AdapterFactory, ExecuteOptions,
  ItemKind, ResolvedConnection, ResultEnvelope, SchemaItem, TreeNode,
} from '../types'
import type { Db, MongoClient } from 'mongodb'
import { offsetFromToken } from '../../core/pagination'

// tree node ids: 'mg:' + dot-joined segments, each escaped so names with dots survive
export function mgNodeId(...parts: string[]): string {
  return 'mg:' + parts.map(p => encodeURIComponent(p).replace(/\./g, '%2E')).join('.')
}

export function parseMgNodeId(id: string): string[] {
  return id.slice(3).split('.').map(decodeURIComponent)
}

// `db.<collection>.<method>( <json args> )`. Args are parsed as strict JSON —
// object keys and strings must be double-quoted (e.g. db.crew.find({"role":"captain"})).
const COMMAND = /^\s*db\s*\.\s*([A-Za-z0-9_$][\w$.-]*)\s*\.\s*(\w+)\s*\(([\s\S]*)\)\s*$/
export function parseMongo(stmt: string): { collection: string; method: string; args: unknown[] } {
  const s = stmt.trim().replace(/;+\s*$/, '')
  const m = COMMAND.exec(s)
  if (!m) throw new Error('expected db.<collection>.<method>(...) — e.g. db.crew.find({"role":"captain"})')
  const [, collection, method, argsText] = m
  let args: unknown[]
  try {
    args = argsText.trim() === '' ? [] : JSON.parse(`[${argsText}]`)
  } catch {
    throw new Error('arguments must be valid JSON (double-quote keys and strings)')
  }
  return { collection, method: method.toLowerCase(), args }
}

// documents are heterogeneous; render BSON scalars via toString, nest the rest as JSON
const cell = (v: unknown): unknown => {
  if (v === null || v === undefined || typeof v !== 'object') return v
  if (v instanceof Date) return v.toISOString()
  if (Buffer.isBuffer(v)) return `\\x${v.toString('hex')}`
  const ctor = (v as { constructor?: { name?: string } }).constructor?.name
  if (ctor && ['ObjectId', 'Long', 'Decimal128', 'Double', 'Int32', 'Binary', 'Timestamp', 'UUID'].includes(ctor)) {
    return (v as { toString(): string }).toString()
  }
  return JSON.stringify(v)
}

// union of top-level keys across the page (_id first), each doc a row
function docsToRows(docs: Record<string, unknown>[]): { columns: { name: string }[]; rows: unknown[][] } {
  const keys: string[] = []
  const seen = new Set<string>()
  for (const d of docs) {
    for (const k of Object.keys(d)) {
      if (!seen.has(k)) { seen.add(k); keys.push(k) }
    }
  }
  keys.sort((a, b) => (a === '_id' ? -1 : b === '_id' ? 1 : 0))
  return { columns: keys.map(name => ({ name })), rows: docs.map(d => keys.map(k => cell(d[k]))) }
}

const READ_METHODS = new Set(['find', 'findone', 'aggregate', 'count', 'countdocuments', 'distinct'])

class MongoAdapter implements Adapter {
  readonly id = 'mongodb'
  private client: MongoClient | undefined

  constructor(private cfg: ResolvedConnection) {}

  private async getDb(): Promise<Db> {
    if (!this.client) {
      const { MongoClient } = await import('mongodb')   // lazy: driver loads on first connect
      const host = String(this.cfg.host)
      const port = Number(this.cfg.port ?? 27017)
      const cred = this.cfg.auth === true
        ? `${encodeURIComponent(String(this.cfg.user ?? ''))}:${encodeURIComponent(this.cfg.secrets.password ?? '')}@`
        : ''
      this.client = new MongoClient(`mongodb://${cred}${host}:${port}`, { serverSelectionTimeoutMS: 8000 })
      await this.client.connect()
    }
    return this.client.db(String(this.cfg.database))
  }

  async connect(cfg: ResolvedConnection) {
    await this.testConnection(cfg)
  }

  async testConnection(cfg: ResolvedConnection) {
    this.cfg = cfg
    const db = await this.getDb()
    await db.command({ ping: 1 })
  }

  async execute(stmt: string, opts: ExecuteOptions): Promise<ResultEnvelope> {
    const db = await this.getDb()
    const { collection, method, args } = parseMongo(stmt)
    const coll = db.collection(collection)
    const started = Date.now()
    const done = (columns: { name: string }[], rows: unknown[][], warnings: string[] = [], next?: string): ResultEnvelope =>
      ({ columns, rows, rowCount: rows.length, elapsedMs: Date.now() - started, warnings, ...(next ? { nextPageToken: next } : {}) })
    const ok = (msg: string): ResultEnvelope =>
      ({ columns: [], rows: [], rowCount: 0, elapsedMs: Date.now() - started, warnings: [`ok — ${msg}`] })

    switch (method) {
      case 'find': {
        const offset = offsetFromToken(opts.pageToken)
        const options = args[1] ? { projection: args[1] as Record<string, unknown> } : {}
        const docs = await coll.find((args[0] as Record<string, unknown>) ?? {}, options)
          .skip(offset).limit(opts.pageSize + 1).toArray() as Record<string, unknown>[]
        const hasMore = docs.length > opts.pageSize
        const { columns, rows } = docsToRows(hasMore ? docs.slice(0, opts.pageSize) : docs)
        return done(columns, rows, [], hasMore ? String(offset + opts.pageSize) : undefined)
      }
      case 'findone': {
        const doc = await coll.findOne((args[0] as Record<string, unknown>) ?? {}) as Record<string, unknown> | null
        const { columns, rows } = docsToRows(doc ? [doc] : [])
        return done(columns, rows)
      }
      case 'aggregate': {
        const all = await coll.aggregate((args[0] as Record<string, unknown>[]) ?? []).toArray() as Record<string, unknown>[]
        const warnings = all.length > opts.pageSize ? [`showing first ${opts.pageSize} of ${all.length} rows`] : []
        const { columns, rows } = docsToRows(all.slice(0, opts.pageSize))
        return done(columns, rows, warnings)
      }
      case 'count': case 'countdocuments': {
        const n = await coll.countDocuments((args[0] as Record<string, unknown>) ?? {})
        return done([{ name: 'count' }], [[n]])
      }
      case 'distinct': {
        const values = await coll.distinct(String(args[0] ?? ''), (args[1] as Record<string, unknown>) ?? {})
        return done([{ name: 'value' }], values.map(v => [cell(v)]))
      }
      case 'insertone': { const r = await coll.insertOne(args[0] as Record<string, unknown>); return ok(`inserted 1 (${r.insertedId})`) }
      case 'insertmany': { const r = await coll.insertMany(args[0] as Record<string, unknown>[]); return ok(`inserted ${r.insertedCount}`) }
      case 'updateone': { const r = await coll.updateOne(args[0] as Record<string, unknown>, args[1] as Record<string, unknown>); return ok(`matched ${r.matchedCount}, modified ${r.modifiedCount}`) }
      case 'updatemany': { const r = await coll.updateMany(args[0] as Record<string, unknown>, args[1] as Record<string, unknown>); return ok(`matched ${r.matchedCount}, modified ${r.modifiedCount}`) }
      case 'replaceone': { const r = await coll.replaceOne(args[0] as Record<string, unknown>, args[1] as Record<string, unknown>); return ok(`matched ${r.matchedCount}, modified ${r.modifiedCount}`) }
      case 'deleteone': { const r = await coll.deleteOne(args[0] as Record<string, unknown>); return ok(`deleted ${r.deletedCount}`) }
      case 'deletemany': { const r = await coll.deleteMany(args[0] as Record<string, unknown>); return ok(`deleted ${r.deletedCount}`) }
      default:
        throw new Error(`unsupported method '${method}' (find, findOne, aggregate, count, distinct, insertOne/Many, updateOne/Many, replaceOne, deleteOne/Many)`)
    }
  }

  private async collectionNames(): Promise<string[]> {
    const db = await this.getDb()
    const cols = await db.listCollections({}, { nameOnly: true }).toArray()
    return cols.map(c => c.name).sort()
  }

  async getChildren(node: TreeNode | null): Promise<TreeNode[]> {
    if (node === null) {
      const names = await this.collectionNames()
      return names.map(name => ({ id: mgNodeId(name), label: name, kind: 'table', hasChildren: true }))
    }
    if (node.kind === 'table') {
      const [name] = parseMgNodeId(node.id)
      const db = await this.getDb()
      const sample = await db.collection(name).findOne({}) as Record<string, unknown> | null
      if (!sample) return []
      // top-level fields of a sampled document (Mongo is schemaless — best effort)
      return Object.keys(sample).map(field => ({
        id: mgNodeId(name, field), label: field, kind: 'column', hasChildren: false,
        detail: sample[field] === null ? 'null' : Array.isArray(sample[field]) ? 'array' : typeof sample[field],
      }))
    }
    return []
  }

  async searchItems(kind: ItemKind, prefix: string): Promise<SchemaItem[]> {
    if (kind === 'table') {
      return (await this.collectionNames())
        .filter(name => name.startsWith(prefix)).slice(0, 50)
        .map(name => ({ kind: 'table', name }))
    }
    if (kind === 'column') {
      const db = await this.getDb()
      const out: SchemaItem[] = []
      const seen = new Set<string>()
      for (const name of await this.collectionNames()) {
        const sample = await db.collection(name).findOne({}) as Record<string, unknown> | null
        if (!sample) continue
        for (const field of Object.keys(sample)) {
          if (field.startsWith(prefix) && !seen.has(field)) { seen.add(field); out.push({ kind: 'column', name: field, parent: name }) }
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

export const mongodbFactory: AdapterFactory = {
  id: 'mongodb',
  validate(raw) {
    const errs: string[] = []
    for (const f of ['host', 'database']) {
      if (typeof raw[f] !== 'string' || raw[f] === '') errs.push(`${f} is required`)
    }
    return errs
  },
  requiredSecrets(cfg) {
    return cfg.auth === true ? ['password'] : []
  },
  create(cfg) {
    return new MongoAdapter(cfg)
  },
}
