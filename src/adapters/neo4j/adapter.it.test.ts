import { describe, expect, it } from 'vitest'
import { neo4jFactory } from './adapter'
import type { ResolvedConnection } from '../types'

const cfg: ResolvedConnection = {
  group: 'test', name: 'it', adapter: 'neo4j', readonly: false,
  host: 'localhost', port: 7687, database: 'neo4j', user: 'neo4j',
  secrets: { password: 'tuplebasepass' },
}

const run = (a: ReturnType<typeof neo4jFactory.create>, cypher: string, pageSize = 500, pageToken?: string) =>
  a.execute(cypher, { pageSize, pageToken, signal: new AbortController().signal })

describe.skipIf(!process.env.TUPLEBASE_IT)('neo4j adapter (needs `npm run db:neo4j`)', () => {
  it('connects and runs a query', async () => {
    const a = neo4jFactory.create(cfg)
    await a.connect(cfg)
    const r = await run(a, 'MATCH (c:Crew) RETURN c.name AS name, c.role AS role ORDER BY c.id')
    expect(r.columns.map(c => c.name)).toEqual(['name', 'role'])
    expect(r.rows[0]).toEqual(['ada', 'captain'])
    expect(r.rowCount).toBe(3)
    await a.dispose()
  })

  it('pages a projection with SKIP/LIMIT', async () => {
    const a = neo4jFactory.create(cfg)
    await a.connect(cfg)
    // c.id is a 64-bit Integer → rendered as its numeric string
    const p1 = await run(a, 'MATCH (c:Crew) RETURN c.id AS id ORDER BY c.id', 2)
    expect(p1.rows.map(row => row[0])).toEqual(['1', '2'])
    expect(p1.nextPageToken).toBe('2')
    const p2 = await run(a, 'MATCH (c:Crew) RETURN c.id AS id ORDER BY c.id', 2, p1.nextPageToken)
    expect(p2.rows.map(row => row[0])).toEqual(['3'])
    expect(p2.nextPageToken).toBeUndefined()
    await a.dispose()
  })

  it('reports a write with its update counts', async () => {
    const a = neo4jFactory.create(cfg)
    await a.connect(cfg)
    const w = await run(a, "CREATE (:Crew {id: 99, name: 'temp', role: 'stowaway'})")
    expect(w.warnings[0]).toMatch(/^ok/)
    await run(a, 'MATCH (c:Crew {id: 99}) DETACH DELETE c')
    await a.dispose()
  })

  it('browses labels + properties and searches items', async () => {
    const a = neo4jFactory.create(cfg)
    await a.connect(cfg)
    const labels = await a.getChildren(null)
    expect(labels.map(l => l.label)).toContain('Crew')
    const props = await a.getChildren(labels.find(l => l.label === 'Crew')!)
    expect(props.map(p => p.label).sort()).toEqual(['id', 'name', 'role'])
    expect((await a.searchItems('table', 'Cr')).map(t => t.name)).toContain('Crew')
    expect((await a.searchItems('column', 'na')).some(c => c.name === 'name')).toBe(true)
    await a.dispose()
  })
})
