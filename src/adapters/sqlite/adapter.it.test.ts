import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sqliteFactory } from './adapter'
import type { ResolvedConnection } from '../types'

// SQLite needs no server — this real integration test runs on every `npm test`,
// unlike the container-gated adapters. It creates a temp file, drives the adapter
// through it (write + persist + read + pagination + schema browse), then cleans up.
const dbPath = join(tmpdir(), `rowboat-sqlite-it-${process.pid}-${Date.now()}.sqlite`)

const cfg: ResolvedConnection = {
  group: 'test', name: 'it', adapter: 'sqlite', readonly: false,
  path: dbPath, secrets: {},
}

const run = (a: ReturnType<typeof sqliteFactory.create>, sql: string, pageSize = 500, pageToken?: string) =>
  a.execute(sql, { pageSize, pageToken, signal: new AbortController().signal })

beforeAll(async () => {
  // bootstrap an empty database file so the adapter has something to open
  const SQL = await (await import('sql.js/dist/sql-asm.js')).default()
  writeFileSync(dbPath, Buffer.from(new SQL.Database().export()))
})

afterAll(() => { rmSync(dbPath, { force: true }) })

describe('sqlite adapter', () => {
  it('creates a schema, reports writes, and reads it back', async () => {
    const a = sqliteFactory.create(cfg)
    await a.connect(cfg)
    await run(a, `create table crew (id integer primary key, name text, role text, meta text)`)
    await run(a, `insert into crew (id, name, role, meta) values
      (1, 'ada', 'captain', '{"rank":1}'), (2, 'lin', 'engineer', '{"rank":2}'), (3, 'sol', 'cook', '{"rank":3}')`)

    const r = await run(a, 'select name, role from crew order by id')
    expect(r.columns.map(c => c.name)).toEqual(['name', 'role'])
    expect(r.rows[0]).toEqual(['ada', 'captain'])
    expect(r.rowCount).toBe(3)

    const w = await run(a, `update crew set role = role where id = 1`)
    expect(w.warnings[0]).toMatch(/row\(s\) affected/)
    expect(w.rowCount).toBe(1)
    await a.dispose()
  })

  it('persists writes to the file (a fresh connection sees them)', async () => {
    const a = sqliteFactory.create(cfg)
    await a.connect(cfg)
    const r = await run(a, 'select count(*) as n from crew')
    expect(r.rows[0][0]).toBe(3)
    await a.dispose()
  })

  it('pages unbounded reads with a continuation token', async () => {
    const a = sqliteFactory.create(cfg)
    await a.connect(cfg)
    const p1 = await run(a, 'select id from crew order by id', 2)
    expect(p1.rows.map(row => row[0])).toEqual([1, 2])
    expect(p1.nextPageToken).toBe('2')
    const p2 = await run(a, 'select id from crew order by id', 2, p1.nextPageToken)
    expect(p2.rows.map(row => row[0])).toEqual([3])
    expect(p2.nextPageToken).toBeUndefined()
    await a.dispose()
  })

  it('renders BLOB values as \\x<hex>', async () => {
    const a = sqliteFactory.create(cfg)
    await a.connect(cfg)
    const r = await run(a, `select x'0102ff' as b`)
    expect(r.rows[0][0]).toBe('\\x0102ff')
    await a.dispose()
  })

  it('browses the schema tree and searches items', async () => {
    const a = sqliteFactory.create(cfg)
    await a.connect(cfg)
    const tables = await a.getChildren(null)
    expect(tables.map(t => t.label)).toContain('crew')
    expect(tables.every(t => t.kind === 'table')).toBe(true)
    const cols = await a.getChildren(tables.find(t => t.label === 'crew')!)
    expect(cols.map(c => c.label)).toEqual(['id', 'name', 'role', 'meta'])
    expect((await a.searchItems('table', 'cr')).map(t => t.name)).toContain('crew')
    expect((await a.searchItems('column', 'na')).some(c => c.name === 'name' && c.parent === 'crew')).toBe(true)
    await a.dispose()
  })

  it('errors clearly when the file is missing', async () => {
    const a = sqliteFactory.create({ ...cfg, path: join(tmpdir(), 'rowboat-sqlite-does-not-exist.sqlite') })
    await expect(a.connect({ ...cfg, path: join(tmpdir(), 'rowboat-sqlite-does-not-exist.sqlite') }))
      .rejects.toThrow(/not found/)
  })
})
