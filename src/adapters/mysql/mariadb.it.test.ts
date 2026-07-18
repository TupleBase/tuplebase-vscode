import { describe, expect, it } from 'vitest'
import { mysqlFactory } from './adapter'
import type { ResolvedConnection } from '../types'

// MariaDB speaks the MySQL wire protocol, so TupleBase reaches it through the
// `mysql` adapter (no separate adapter — the CockroachDB-via-postgres pattern).
// This test proves the mysql adapter drives a real MariaDB container end to end.
const cfg: ResolvedConnection = {
  group: 'test', name: 'it', adapter: 'mysql', readonly: false,
  host: 'localhost', port: 3307, database: 'tuplebase', user: 'tuplebase',
  secrets: { password: 'tuplebase' },
}

describe.skipIf(!process.env.TUPLEBASE_IT)('mysql adapter against MariaDB (needs `npm run db:start -- mariadb && npm run db:seed -- mariadb`)', () => {
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
    await a.dispose()
  })
})
