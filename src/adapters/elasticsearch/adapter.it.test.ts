import { describe, expect, it } from 'vitest'
import { elasticsearchFactory } from './adapter'
import type { ResolvedConnection } from '../types'

const cfg: ResolvedConnection = {
  group: 'test', name: 'it', adapter: 'elasticsearch', readonly: false,
  host: 'localhost', port: 9200, secrets: {},
}

const run = (a: ReturnType<typeof elasticsearchFactory.create>, req: string, pageSize = 500, pageToken?: string) =>
  a.execute(req, { pageSize, pageToken, signal: new AbortController().signal })

describe.skipIf(!process.env.TUPLEBASE_IT)('elasticsearch adapter (needs `npm run db:elasticsearch`)', () => {
  it('searches and flattens hits into rows', async () => {
    const a = elasticsearchFactory.create(cfg)
    await a.connect(cfg)
    const r = await run(a, 'GET /crew/_search {"query":{"match":{"role":"captain"}}}')
    const nameIdx = r.columns.findIndex(c => c.name === 'name')
    expect(nameIdx).toBeGreaterThanOrEqual(0)
    expect(r.rows[0][nameIdx]).toBe('ada')
    await a.dispose()
  })

  it('pages a search by injecting from/size', async () => {
    const a = elasticsearchFactory.create(cfg)
    await a.connect(cfg)
    const p1 = await run(a, 'GET /crew/_search {"sort":["id"]}', 2)
    expect(p1.rows.length).toBe(2)
    expect(p1.nextPageToken).toBe('2')
    const p2 = await run(a, 'GET /crew/_search {"sort":["id"]}', 2, p1.nextPageToken)
    expect(p2.rows.length).toBe(1)
    expect(p2.nextPageToken).toBeUndefined()
    await a.dispose()
  })

  it('returns _cat listings and writes as rows', async () => {
    const a = elasticsearchFactory.create(cfg)
    await a.connect(cfg)
    const cat = await run(a, 'GET /_cat/indices?format=json&h=index')
    expect((cat.rows.map(row => row[cat.columns.findIndex(c => c.name === 'index')]) as string[])).toContain('crew')
    await a.dispose()
  })

  it('browses indices + mapping fields and searches items', async () => {
    const a = elasticsearchFactory.create(cfg)
    await a.connect(cfg)
    const indices = await a.getChildren(null)
    expect(indices.map(t => t.label)).toContain('crew')
    const fields = await a.getChildren(indices.find(t => t.label === 'crew')!)
    expect(fields.map(f => f.label).sort()).toEqual(['id', 'name', 'role'])
    expect((await a.searchItems('table', 'cr')).map(t => t.name)).toContain('crew')
    expect((await a.searchItems('column', 'na')).some(c => c.name === 'name')).toBe(true)
    await a.dispose()
  })
})
