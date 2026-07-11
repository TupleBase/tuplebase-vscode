import { describe, expect, it } from 'vitest'
import { mssqlFactory } from './adapter'
import type { ResolvedConnection } from '../types'

const cfg: ResolvedConnection = {
  group: 'test', name: 'it', adapter: 'mssql', readonly: false,
  host: 'localhost', port: 1433, database: 'rowboat', user: 'sa',
  secrets: { password: 'Rowboat!Pass1' },
}

const run = (a: ReturnType<typeof mssqlFactory.create>, sql: string, pageSize = 500) =>
  a.execute(sql, { pageSize, signal: new AbortController().signal })

describe.skipIf(!process.env.RB_IT)('mssql adapter (needs `npm run db:mssql`)', () => {
  it('connects and runs a query', async () => {
    const a = mssqlFactory.create(cfg)
    await a.connect(cfg)
    const r = await run(a, 'select name, role from dbo.crew order by id')
    expect(r.columns.map(c => c.name)).toEqual(['name', 'role'])
    expect(r.rows[0]).toEqual(['ada', 'captain'])
    expect(r.rowCount).toBe(3)
    await a.dispose()
  })

  it('reports writes with an affected-rows count', async () => {
    const a = mssqlFactory.create(cfg)
    await a.connect(cfg)
    const w = await run(a, 'update dbo.crew set role = role where id = 1')
    expect(w.warnings[0]).toMatch(/row\(s\) affected/)
    expect(w.rowCount).toBe(1)
    await a.dispose()
  })

  it('browses the schema tree and searches items', async () => {
    const a = mssqlFactory.create(cfg)
    await a.connect(cfg)
    const schemas = await a.getChildren(null)
    const dbo = schemas.find(s => s.label === 'dbo')!
    expect(dbo.kind).toBe('schema')
    const tables = await a.getChildren(dbo)
    expect(tables.map(t => t.label)).toContain('crew')
    const cols = await a.getChildren(tables.find(t => t.label === 'crew')!)
    expect(cols.map(c => c.label)).toEqual(['id', 'name', 'role'])
    expect((await a.searchItems('table', 'cr')).map(t => t.name)).toContain('crew')
    expect((await a.searchItems('column', 'na')).some(c => c.name === 'name')).toBe(true)
    await a.dispose()
  })
})
