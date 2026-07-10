import { describe, expect, it } from 'vitest'
import { dynamodbFactory } from './dynamodb'
import type { ExecuteOptions, ResolvedConnection, ResultEnvelope } from './types'

const cfg: ResolvedConnection = {
  env: 'test', name: 'it', adapter: 'dynamodb',
  region: 'local', endpoint: 'http://localhost:8000',
  secrets: {},
}

const opts = (over: Partial<ExecuteOptions> = {}): ExecuteOptions =>
  ({ pageSize: 500, signal: new AbortController().signal, ...over })

const col = (r: ResultEnvelope, name: string) => r.columns.findIndex(c => c.name === name)

describe.skipIf(!process.env.RB_IT)('dynamodb adapter (needs `npm run db:dynamo`)', () => {
  it('validates config', () => {
    expect(dynamodbFactory.validate({ adapter: 'dynamodb' })).toContain('region is required')
    expect(dynamodbFactory.validate({ adapter: 'dynamodb', region: 'local' })).toEqual([])
  })

  it('connects and selects all voyages', async () => {
    const a = dynamodbFactory.create(cfg)
    await a.connect(cfg)
    const r = await a.execute('SELECT * FROM voyages', opts())
    expect(r.rowCount).toBe(6)
    for (const name of ['crew_name', 'departed_at', 'destination', 'boat_id', 'status', 'weather', 'manifest']) {
      expect(r.columns.map(c => c.name)).toContain(name)
    }
    expect(r.nextPageToken).toBeUndefined()
    expect(r.elapsedMs).toBeGreaterThanOrEqual(0)
    await a.dispose()
  })

  it('filters with a WHERE clause', async () => {
    const a = dynamodbFactory.create(cfg)
    await a.connect(cfg)
    const r = await a.execute(
      "SELECT * FROM voyages WHERE crew_name='ada' AND departed_at='2026-07-01T08:00:00Z'", opts(),
    )
    expect(r.rowCount).toBe(1)
    expect(r.rows[0][col(r, 'crew_name')]).toBe('ada')
    expect(r.rows[0][col(r, 'boat_id')]).toBe('boat-1')
    await a.dispose()
  })

  it('paginates with pageSize and resumes from pageToken', async () => {
    const a = dynamodbFactory.create(cfg)
    await a.connect(cfg)
    const first = await a.execute('SELECT * FROM voyages', opts({ pageSize: 2 }))
    expect(first.rows).toHaveLength(2)
    expect(first.nextPageToken).toBeTruthy()
    const pages = [first]
    let page = first
    while (page.nextPageToken) {
      page = await a.execute('SELECT * FROM voyages', opts({ pageSize: 2, pageToken: page.nextPageToken }))
      pages.push(page)
    }
    const crews = pages.flatMap(result => result.rows.map(row => row[col(result, 'crew_name')])).sort()
    expect(crews).toEqual(['ada', 'ada', 'donald', 'grace', 'linus', 'margaret'])
    await a.dispose()
  })

  it('round-trips INSERT and DELETE as empty envelopes with an ok warning', async () => {
    const a = dynamodbFactory.create(cfg)
    await a.connect(cfg)
    const key = "crew_name='zed' AND departed_at='2026-07-07T09:00:00Z'"
    const ins = await a.execute(
      "INSERT INTO voyages VALUE {'crew_name':'zed','departed_at':'2026-07-07T09:00:00Z','destination':'nowhere','oars':1}",
      opts(),
    )
    expect(ins.rows).toEqual([])
    expect(ins.rowCount).toBe(0)
    expect(ins.warnings).toEqual(['ok — statement returned no items'])
    const check = await a.execute(`SELECT * FROM voyages WHERE ${key}`, opts())
    expect(check.rowCount).toBe(1)
    const del = await a.execute(`DELETE FROM voyages WHERE ${key}`, opts())
    expect(del.warnings).toEqual(['ok — statement returned no items'])
    const gone = await a.execute(`SELECT * FROM voyages WHERE ${key}`, opts())
    expect(gone.rowCount).toBe(0)
    await a.dispose()
  })

  it('builds the table → keys → GSI tree', async () => {
    const a = dynamodbFactory.create(cfg)
    await a.connect(cfg)
    const root = await a.getChildren(null)
    expect(root.map(n => [n.label, n.kind, n.hasChildren])).toContainEqual(['voyages', 'table', true])
    const children = await a.getChildren(root.find(n => n.label === 'voyages')!)
    expect(children.map(n => [n.label, n.kind, n.detail, n.hasChildren])).toEqual(expect.arrayContaining([
      ['crew_name', 'key', 'partition key (S)', false],
      ['departed_at', 'key', 'sort key (S)', false],
      ['by-destination', 'index', 'GSI', true],
      ['by-boat-and-time', 'index', 'GSI', true],
    ]))
    const gsiKeys = await a.getChildren(children.find(n => n.label === 'by-destination')!)
    expect(gsiKeys.map(n => [n.label, n.kind, n.detail])).toEqual([['destination', 'key', 'partition key (S)']])
    await a.dispose()
  })

  it('searchItems finds tables and cached key attributes by prefix', async () => {
    const a = dynamodbFactory.create(cfg)
    await a.connect(cfg)
    const tables = await a.searchItems('table', 'voy')
    expect(tables.map(i => i.name)).toContain('voyages')
    await a.getChildren({ id: 'ddb:voyages', label: 'voyages', kind: 'table', hasChildren: true })
    const cols = await a.searchItems('column', 'crew')
    expect(cols.map(i => [i.name, i.parent])).toContainEqual(['crew_name', 'voyages'])
    await a.dispose()
  })

  it('surfaces AWS errors with their message', async () => {
    const a = dynamodbFactory.create(cfg)
    await a.connect(cfg)
    await expect(a.execute('SELECT * FROM missing_table', opts())).rejects.toThrow(/non-existent table/)
    await a.dispose()
  })
})
