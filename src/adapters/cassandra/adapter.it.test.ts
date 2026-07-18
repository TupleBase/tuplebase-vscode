import { describe, expect, it } from 'vitest'
import { cassandraFactory } from './adapter'
import type { ResolvedConnection } from '../types'

const cfg: ResolvedConnection = {
  group: 'test', name: 'it', adapter: 'cassandra', readonly: false,
  host: 'localhost', port: 9042, datacenter: 'datacenter1', keyspace: 'tuplebase',
  secrets: {},
}

const run = (a: ReturnType<typeof cassandraFactory.create>, cql: string, pageSize = 500, pageToken?: string) =>
  a.execute(cql, { pageSize, pageToken, signal: new AbortController().signal })

describe.skipIf(!process.env.TUPLEBASE_IT)('cassandra adapter (needs `npm run db:start -- cassandra && npm run db:seed -- cassandra`)', () => {
  it('connects and runs a query', async () => {
    const a = cassandraFactory.create(cfg)
    await a.connect(cfg)
    const r = await run(a, 'select name, role from crew where id = 1')
    expect(r.columns.map(c => c.name)).toEqual(['name', 'role'])
    expect(r.rows[0]).toEqual(['ada', 'captain'])
    await a.dispose()
  })

  it('pages with the native pageState continuation token', async () => {
    const a = cassandraFactory.create(cfg)
    await a.connect(cfg)
    const p1 = await run(a, 'select id from crew', 2)
    expect(p1.rows.length).toBe(2)
    expect(p1.nextPageToken).toBeTruthy()
    const p2 = await run(a, 'select id from crew', 2, p1.nextPageToken)
    // all three primary keys are seen exactly once across the two pages
    const ids = [...p1.rows, ...p2.rows].map(row => row[0]).sort()
    expect(ids).toEqual([1, 2, 3])
    await a.dispose()
  })

  it('reports a write as ok', async () => {
    const a = cassandraFactory.create(cfg)
    await a.connect(cfg)
    const w = await run(a, "insert into crew (id, name, role) values (99, 'temp', 'stowaway')")
    expect(w.warnings).toEqual(['ok'])
    await run(a, 'delete from crew where id = 99')
    await a.dispose()
  })

  it('browses the schema tree and searches items', async () => {
    const a = cassandraFactory.create(cfg)
    await a.connect(cfg)
    const keyspaces = await a.getChildren(null)
    const ks = keyspaces.find(s => s.label === 'tuplebase')!
    expect(ks.kind).toBe('schema')
    const tables = await a.getChildren(ks)
    expect(tables.map(t => t.label)).toContain('crew')
    const cols = await a.getChildren(tables.find(t => t.label === 'crew')!)
    expect(cols.map(c => c.label).sort()).toEqual(['id', 'name', 'role'])
    expect((await a.searchItems('table', 'cr')).map(t => t.name)).toContain('crew')
    expect((await a.searchItems('column', 'na')).some(c => c.name === 'name')).toBe(true)
    await a.dispose()
  })
})
