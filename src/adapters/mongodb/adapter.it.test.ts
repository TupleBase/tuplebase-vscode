import { describe, expect, it } from 'vitest'
import { mongodbFactory } from './adapter'
import type { ResolvedConnection } from '../types'

const cfg: ResolvedConnection = {
  group: 'test', name: 'it', adapter: 'mongodb', readonly: false,
  host: 'localhost', port: 27017, database: 'tuplebase', secrets: {},
}

const run = (a: ReturnType<typeof mongodbFactory.create>, cmd: string, pageSize = 500, pageToken?: string) =>
  a.execute(cmd, { pageSize, pageToken, signal: new AbortController().signal })

describe.skipIf(!process.env.TUPLEBASE_IT)('mongodb adapter (needs `npm run db:start -- mongodb && npm run db:seed -- mongodb`)', () => {
  it('runs find, count and distinct', async () => {
    const a = mongodbFactory.create(cfg)
    await a.connect(cfg)
    const r = await run(a, 'db.crew.find({"role":"captain"})')
    const nameIdx = r.columns.findIndex(c => c.name === 'name')
    expect(r.rows[0][nameIdx]).toBe('ada')

    const c = await run(a, 'db.crew.count({})')
    expect(c.columns.map(x => x.name)).toEqual(['count'])
    expect(c.rows[0][0]).toBe(3)

    const d = await run(a, 'db.crew.distinct("role",{})')
    expect((d.rows.map(row => row[0]) as string[]).sort()).toEqual(['captain', 'engineer', 'navigator'])
    await a.dispose()
  })

  it('reports writes and pages find with skip/limit', async () => {
    const a = mongodbFactory.create(cfg)
    await a.connect(cfg)
    const w = await run(a, 'db.crew.insertOne({"id":99,"name":"temp","role":"stowaway"})')
    expect(w.warnings[0]).toMatch(/inserted 1/)

    const p1 = await run(a, 'db.crew.find({"id":{"$lt":99}})', 2)
    expect(p1.rows.length).toBe(2)
    expect(p1.nextPageToken).toBe('2')
    const p2 = await run(a, 'db.crew.find({"id":{"$lt":99}})', 2, p1.nextPageToken)
    expect(p2.rows.length).toBe(1)
    expect(p2.nextPageToken).toBeUndefined()

    const del = await run(a, 'db.crew.deleteMany({"id":99})')
    expect(del.warnings[0]).toMatch(/deleted 1/)
    await a.dispose()
  })

  it('browses collections + sampled fields and searches items', async () => {
    const a = mongodbFactory.create(cfg)
    await a.connect(cfg)
    const collections = await a.getChildren(null)
    expect(collections.map(t => t.label)).toContain('crew')
    const fields = await a.getChildren(collections.find(t => t.label === 'crew')!)
    expect(fields.map(f => f.label)).toEqual(expect.arrayContaining(['_id', 'id', 'name', 'role']))
    expect((await a.searchItems('table', 'cr')).map(t => t.name)).toContain('crew')
    expect((await a.searchItems('column', 'na')).some(c => c.name === 'name')).toBe(true)
    await a.dispose()
  })
})
