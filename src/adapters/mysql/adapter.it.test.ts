import { describe, expect, it } from 'vitest'
import { mysqlFactory } from './adapter'
import type { ResolvedConnection } from '../types'

const cfg: ResolvedConnection = {
  group: 'test', name: 'it', adapter: 'mysql', readonly: false,
  host: 'localhost', port: 3306, database: 'tuplebase', user: 'tuplebase',
  secrets: { password: 'tuplebase' },
}

describe.skipIf(!process.env.TUPLEBASE_IT)('mysql adapter (needs `npm run db:mysql`)', () => {
  it('connects and runs a query', async () => {
    const a = mysqlFactory.create(cfg)
    await a.connect(cfg)
    const r = await a.execute('select name, role from crew order by id', {
      pageSize: 500, signal: new AbortController().signal,
    })
    expect(r.columns.map(c => c.name)).toEqual(['name', 'role'])
    expect(r.rows[0]).toEqual(['ada', 'captain'])
    expect(r.rowCount).toBe(3)
    await a.dispose()
  })

  it('stringifies JSON columns and reports writes', async () => {
    const a = mysqlFactory.create(cfg)
    await a.connect(cfg)
    const r = await a.execute('select meta from crew where id = 1', { pageSize: 10, signal: new AbortController().signal })
    expect(r.rows[0][0]).toBe('{"rank":1}')
    const w = await a.execute('update crew set role = role where id = 1', { pageSize: 10, signal: new AbortController().signal })
    expect(w.warnings[0]).toMatch(/row\(s\) affected/)
    await a.dispose()
  })

  it('browses the schema tree and searches items', async () => {
    const a = mysqlFactory.create(cfg)
    await a.connect(cfg)
    const schemas = await a.getChildren(null)
    const db = schemas.find(s => s.label === 'tuplebase')!
    expect(db.kind).toBe('schema')
    const tables = await a.getChildren(db)
    expect(tables.map(t => t.label)).toContain('crew')
    const cols = await a.getChildren(tables.find(t => t.label === 'crew')!)
    expect(cols.map(c => c.label)).toEqual(['id', 'name', 'role', 'meta'])
    expect((await a.searchItems('table', 'cr')).map(t => t.name)).toContain('crew')
    expect((await a.searchItems('column', 'na')).some(c => c.name === 'name')).toBe(true)
    await a.dispose()
  })
})
