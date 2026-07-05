import { describe, expect, it } from 'vitest'
import { postgresFactory } from './postgres'
import type { ResolvedConnection } from './types'

const cfg: ResolvedConnection = {
  env: 'test', name: 'it', adapter: 'postgres',
  host: 'localhost', port: 5432, database: 'rowboat', user: 'rowboat',
  secrets: { password: 'rowboat' },
}

describe.skipIf(!process.env.RB_IT)('postgres adapter (needs `npm run db:postgres`)', () => {
  it('validates config', () => {
    expect(postgresFactory.validate({ adapter: 'postgres' })).toContain('host is required')
    expect(postgresFactory.validate({ adapter: 'postgres', host: 'x', database: 'y', user: 'z' })).toEqual([])
  })

  it('requires a password secret', () => {
    expect(postgresFactory.requiredSecrets(cfg)).toEqual(['password'])
  })

  it('connects and runs a query', async () => {
    const a = postgresFactory.create(cfg)
    await a.connect(cfg)
    const r = await a.execute('select name, role from crew order by id', {
      pageSize: 500, signal: new AbortController().signal,
    })
    expect(r.columns.map(c => c.name)).toEqual(['name', 'role'])
    expect(r.rows[0]).toEqual(['ada', 'captain'])
    expect(r.rowCount).toBe(3)
    expect(r.elapsedMs).toBeGreaterThanOrEqual(0)
    await a.dispose()
  })

  it('caps rows at pageSize with a warning', async () => {
    const a = postgresFactory.create(cfg)
    await a.connect(cfg)
    const r = await a.execute('select generate_series(1, 1000)', {
      pageSize: 100, signal: new AbortController().signal,
    })
    expect(r.rows).toHaveLength(100)
    expect(r.warnings[0]).toMatch(/first 100/)
    await a.dispose()
  })

  it('lists schema tree children', async () => {
    const a = postgresFactory.create(cfg)
    await a.connect(cfg)
    const schemas = await a.getChildren(null)
    const pub = schemas.find(s => s.label === 'public')!
    expect(pub.kind).toBe('schema')
    const tables = await a.getChildren(pub)
    expect(tables.map(t => t.label).sort()).toEqual(['crew', 'voyages'])
    const cols = await a.getChildren(tables.find(t => t.label === 'crew')!)
    expect(cols.map(c => c.label)).toContain('name')
    expect(cols[0].hasChildren).toBe(false)
    await a.dispose()
  })

  it('searchItems finds tables by prefix', async () => {
    const a = postgresFactory.create(cfg)
    await a.connect(cfg)
    const items = await a.searchItems('table', 'cr')
    expect(items.map(i => i.name)).toContain('crew')
    await a.dispose()
  })

  it('surfaces sql errors with the pg message', async () => {
    const a = postgresFactory.create(cfg)
    await a.connect(cfg)
    await expect(
      a.execute('select * from nope', { pageSize: 10, signal: new AbortController().signal })
    ).rejects.toThrow(/relation "nope" does not exist/)
    await a.dispose()
  })
})
