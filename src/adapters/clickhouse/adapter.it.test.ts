import { describe, expect, it } from 'vitest'
import { clickhouseFactory } from './adapter'
import type { ResolvedConnection } from '../types'

const cfg: ResolvedConnection = {
  group: 'test', name: 'it', adapter: 'clickhouse', readonly: false,
  host: 'localhost', port: 8123, database: 'tuplebase', user: 'default',
  secrets: {},
}

const run = (a: ReturnType<typeof clickhouseFactory.create>, sql: string, pageSize = 500, pageToken?: string) =>
  a.execute(sql, { pageSize, pageToken, signal: new AbortController().signal })

describe.skipIf(!process.env.TUPLEBASE_IT)('clickhouse adapter (needs `npm run db:clickhouse`)', () => {
  it('connects and runs a query', async () => {
    const a = clickhouseFactory.create(cfg)
    await a.connect(cfg)
    const r = await run(a, 'select name, role from crew order by id')
    expect(r.columns.map(c => c.name)).toEqual(['name', 'role'])
    expect(r.rows[0]).toEqual(['ada', 'captain'])
    expect(r.rowCount).toBe(3)
    await a.dispose()
  })

  it('reports a write / DDL as ok and pages unbounded reads', async () => {
    const a = clickhouseFactory.create(cfg)
    await a.connect(cfg)
    const w = await run(a, `insert into crew (id, name, role) values (99, 'temp', 'stowaway')`)
    expect(w.warnings).toEqual(['ok'])
    const p1 = await run(a, 'select id from crew where id < 99 order by id', 2)
    expect(p1.rows.map(row => row[0])).toEqual([1, 2])
    expect(p1.nextPageToken).toBe('2')
    const p2 = await run(a, 'select id from crew where id < 99 order by id', 2, p1.nextPageToken)
    expect(p2.rows.map(row => row[0])).toEqual([3])
    expect(p2.nextPageToken).toBeUndefined()
    await run(a, 'delete from crew where id = 99')
    await a.dispose()
  })

  it('browses the schema tree and searches items', async () => {
    const a = clickhouseFactory.create(cfg)
    await a.connect(cfg)
    const dbs = await a.getChildren(null)
    const db = dbs.find(s => s.label === 'tuplebase')!
    expect(db.kind).toBe('schema')
    const tables = await a.getChildren(db)
    expect(tables.map(t => t.label)).toContain('crew')
    const cols = await a.getChildren(tables.find(t => t.label === 'crew')!)
    expect(cols.map(c => c.label)).toEqual(['id', 'name', 'role'])
    expect((await a.searchItems('table', 'cr')).map(t => t.name)).toContain('crew')
    expect((await a.searchItems('column', 'na')).some(c => c.name === 'name' && c.parent === 'crew')).toBe(true)
    await a.dispose()
  })
})
