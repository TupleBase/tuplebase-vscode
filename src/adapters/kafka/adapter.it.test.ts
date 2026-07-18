import { describe, expect, it } from 'vitest'
import { kafkaFactory } from './adapter'
import type { ResolvedConnection } from '../types'

const cfg: ResolvedConnection = {
  group: 'test', name: 'it', adapter: 'kafka', readonly: false,
  host: 'localhost', port: 9092, secrets: {},
}

const run = (a: ReturnType<typeof kafkaFactory.create>, cmd: string, pageSize = 500) =>
  a.execute(cmd, { pageSize, signal: new AbortController().signal })

describe.skipIf(!process.env.TUPLEBASE_IT)('kafka adapter (needs `npm run db:start -- kafka && npm run db:seed -- kafka`)', () => {
  it('lists topics and describes partitions', async () => {
    const a = kafkaFactory.create(cfg)
    await a.connect(cfg)
    const topics = await run(a, 'topics')
    expect(topics.columns.map(c => c.name)).toEqual(['topic', 'partitions'])
    expect(topics.rows.map(r => r[0])).toContain('crew')

    const desc = await run(a, 'describe crew')
    expect(desc.columns.map(c => c.name)).toEqual(['partition', 'leader', 'replicas', 'earliest', 'latest'])
    expect(desc.rows[0][0]).toBe(0)
    await a.dispose()
  })

  it('consumes the tail of a topic', async () => {
    const a = kafkaFactory.create(cfg)
    await a.connect(cfg)
    const r = await run(a, 'consume crew 3')
    expect(r.columns.map(c => c.name)).toEqual(['partition', 'offset', 'key', 'value', 'timestamp'])
    expect(r.rows.length).toBe(3)
    const keyIdx = r.columns.findIndex(c => c.name === 'key')
    const valIdx = r.columns.findIndex(c => c.name === 'value')
    expect(r.rows.map(row => row[keyIdx])).toEqual(['1', '2', '3'])
    expect(String(r.rows[0][valIdx])).toContain('ada')
    await a.dispose()
  }, 20000)

  it('browses topics + partitions and searches items', async () => {
    const a = kafkaFactory.create(cfg)
    await a.connect(cfg)
    const topics = await a.getChildren(null)
    expect(topics.map(t => t.label)).toContain('crew')
    const partitions = await a.getChildren(topics.find(t => t.label === 'crew')!)
    expect(partitions[0].label).toBe('partition 0')
    expect((await a.searchItems('table', 'cr')).map(t => t.name)).toContain('crew')
    await a.dispose()
  })
})
