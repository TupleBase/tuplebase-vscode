import { describe, expect, it } from 'vitest'
import { postgresFactory } from './adapter'
import type { ResolvedConnection } from '../types'

const cfg: ResolvedConnection = {
  group: 'test', name: 'it', adapter: 'postgres', readonly: false,
  host: 'localhost', port: 5432, database: 'tuplebase', user: 'tuplebase',
  secrets: { password: 'tuplebase' },
}

describe.skipIf(!process.env.TUPLEBASE_IT)('postgres adapter (needs `npm run db:start -- postgres && npm run db:seed -- postgres`)', () => {
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
    expect(r.rowCount).toBe(8)
    expect(r.elapsedMs).toBeGreaterThanOrEqual(0)
    await a.dispose()
  })

  it('bounds an unlimited SELECT and returns a continuation token', async () => {
    const a = postgresFactory.create(cfg)
    await a.connect(cfg)
    const first = await a.execute('select generate_series(1, 1000) as n', {
      pageSize: 100, signal: new AbortController().signal,
    })
    expect(first.rows).toHaveLength(100)
    expect(first.rows[0]).toEqual([1])
    expect(first.nextPageToken).toBe('100')   // more available, no over-fetch warning
    // resume from the token → the next window
    const next = await a.execute('select generate_series(1, 1000) as n', {
      pageSize: 100, pageToken: first.nextPageToken, signal: new AbortController().signal,
    })
    expect(next.rows[0]).toEqual([101])
    await a.dispose()
  })

  it('leaves a user LIMIT alone (no continuation token)', async () => {
    const a = postgresFactory.create(cfg)
    await a.connect(cfg)
    const r = await a.execute('select generate_series(1, 1000) limit 5', {
      pageSize: 100, signal: new AbortController().signal,
    })
    expect(r.rows).toHaveLength(5)
    expect(r.nextPageToken).toBeUndefined()
    await a.dispose()
  })

  it('lists schema tree children', async () => {
    const a = postgresFactory.create(cfg)
    await a.connect(cfg)
    const schemas = await a.getChildren(null)
    const pub = schemas.find(s => s.label === 'public')!
    expect(pub.kind).toBe('schema')
    const tables = await a.getChildren(pub)
    expect(tables.map(t => t.label)).toEqual(expect.arrayContaining([
      'boats', 'cargo_manifests', 'crew', 'maintenance_logs', 'ports', 'voyage_crew', 'voyages',
    ]))
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

  it('cancels a running query on abort, rejecting fast', async () => {
    const a = postgresFactory.create(cfg)
    await a.connect(cfg)
    const ac = new AbortController()
    setTimeout(() => ac.abort(), 100)
    const started = Date.now()
    await expect(
      a.execute('select pg_sleep(10)', { pageSize: 10, signal: ac.signal })
    ).rejects.toThrow(/cancel/i)   // pg 57014: canceling statement due to user request
    expect(Date.now() - started).toBeLessThan(5000)
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
