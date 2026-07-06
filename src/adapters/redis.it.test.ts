import { describe, expect, it } from 'vitest'
import { redisFactory } from './redis'
import type { ResolvedConnection } from './types'

const cfg: ResolvedConnection = {
  env: 'test', name: 'it', adapter: 'redis',
  host: 'localhost', port: 6379,
  secrets: {},
}

const opts = () => ({ pageSize: 500, signal: new AbortController().signal })

describe.skipIf(!process.env.RB_IT)('redis adapter (needs `npm run db:redis`)', () => {
  it('validates config', () => {
    expect(redisFactory.validate({ adapter: 'redis' })).toContain('host is required')
    expect(redisFactory.validate({ adapter: 'redis', host: 'x' })).toEqual([])
  })

  it('requires a password secret only when auth is set', () => {
    expect(redisFactory.requiredSecrets(cfg)).toEqual([])
    expect(redisFactory.requiredSecrets({ ...cfg, auth: true })).toEqual(['password'])
  })

  it('connects and runs a scalar command', async () => {
    const a = redisFactory.create(cfg)
    await a.connect(cfg)
    const r = await a.execute('GET crew:1:name', opts())
    expect(r.columns.map(c => c.name)).toEqual(['value'])
    expect(r.rows).toEqual([['ada']])
    expect(r.elapsedMs).toBeGreaterThanOrEqual(0)
    await a.dispose()
  })

  it('renders hashes as field/value rows', async () => {
    const a = redisFactory.create(cfg)
    await a.connect(cfg)
    const r = await a.execute('HGETALL boat:1', opts())
    expect(r.columns.map(c => c.name)).toEqual(['field', 'value'])
    expect(r.rows).toContainEqual(['name', 'Rowboat One'])
    expect(r.rows).toContainEqual(['oars', '2'])
    await a.dispose()
  })

  it('skips comment lines and caps rows at pageSize', async () => {
    const a = redisFactory.create(cfg)
    await a.connect(cfg)
    const r = await a.execute('# comment\nLRANGE queue:departures 0 -1', {
      pageSize: 2, signal: new AbortController().signal,
    })
    expect(r.rows).toEqual([[1, 'upstream'], [2, 'downstream']])
    expect(r.rowCount).toBe(3)
    expect(r.warnings[0]).toMatch(/first 2 of 3/)
    await a.dispose()
  })

  it('rejects multi-command input and empty input', async () => {
    const a = redisFactory.create(cfg)
    await a.connect(cfg)
    await expect(a.execute('GET a\nGET b', opts())).rejects.toThrow(/one redis command/)
    await expect(a.execute('# only a comment', opts())).rejects.toThrow(/no redis command/)
    await a.dispose()
  })

  it('round-trips quoted arguments', async () => {
    const a = redisFactory.create(cfg)
    await a.connect(cfg)
    await a.execute('SET "tmp key" "a b"', opts())
    const r = await a.execute('GET "tmp key"', opts())
    expect(r.rows).toEqual([['a b']])
    await a.execute('DEL "tmp key"', opts())
    await a.dispose()
  })

  it('builds the key-namespace tree from seed data', async () => {
    const a = redisFactory.create(cfg)
    await a.connect(cfg)
    const root = await a.getChildren(null)
    expect(root.map(n => [n.label, n.kind, n.detail])).toEqual([
      ['boat', 'namespace', '2 keys'],
      ['crew', 'namespace', '6 keys'],
      ['queue', 'namespace', '1 key'],
      ['stats', 'namespace', '1 key'],
    ])
    const crew = await a.getChildren(root.find(n => n.label === 'crew')!)
    expect(crew.map(n => n.label)).toEqual(['1', '2', '3'])
    const crew1 = await a.getChildren(crew[0])
    expect(crew1.map(n => [n.label, n.kind, n.detail, n.hasChildren])).toEqual([
      ['name', 'key', 'string', false],
      ['role', 'key', 'string', false],
    ])
    const queue = await a.getChildren(root.find(n => n.label === 'queue')!)
    expect(queue[0].detail).toBe('list')
    await a.dispose()
  })

  it('searchItems finds keys by prefix', async () => {
    const a = redisFactory.create(cfg)
    await a.connect(cfg)
    const items = await a.searchItems('key', 'crew:1:')
    expect(items.map(i => i.name)).toEqual(['crew:1:name', 'crew:1:role'])
    await a.dispose()
  })

  it('surfaces server errors with the redis message', async () => {
    const a = redisFactory.create(cfg)
    await a.connect(cfg)
    await expect(a.execute('NOTACOMMAND x', opts())).rejects.toThrow(/unknown command/)
    await expect(a.execute('INCR crew:1:name', opts())).rejects.toThrow(/not an integer/)
    await a.dispose()
  })
})
