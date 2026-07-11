import type {
  Adapter, AdapterFactory, ExecuteOptions,
  ItemKind, ResolvedConnection, ResultEnvelope, SchemaItem, TreeNode,
} from '../types'
import type { Admin, Kafka } from 'kafkajs'

// internal Kafka topics are hidden from the tree / listings
const isInternal = (t: string): boolean => t.startsWith('__') || t.startsWith('_schemas')

// tree node ids: 'kf:' + dot-joined segments, each escaped so names with dots survive
export function kfNodeId(...parts: string[]): string {
  return 'kf:' + parts.map(p => encodeURIComponent(p).replace(/\./g, '%2E')).join('.')
}

export function parseKfNodeId(id: string): string[] {
  return id.slice(3).split('.').map(decodeURIComponent)
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

class KafkaAdapter implements Adapter {
  readonly id = 'kafka'
  private kafka: Kafka | undefined
  private admin: Admin | undefined

  constructor(private cfg: ResolvedConnection) {}

  private async getAdmin(): Promise<Admin> {
    if (!this.admin) {
      const { Kafka, logLevel } = await import('kafkajs')   // lazy: driver loads on first connect
      this.kafka = new Kafka({
        clientId: 'rowboat',
        brokers: [`${String(this.cfg.host)}:${Number(this.cfg.port ?? 9092)}`],
        logLevel: logLevel.NOTHING,
        connectionTimeout: 8000,
        retry: { retries: 2 },
      })
      this.admin = this.kafka.admin()
      await this.admin.connect()
    }
    return this.admin
  }

  async connect(cfg: ResolvedConnection) {
    await this.testConnection(cfg)
  }

  async testConnection(cfg: ResolvedConnection) {
    this.cfg = cfg
    const admin = await this.getAdmin()
    await admin.listTopics()
  }

  private async topicNames(): Promise<string[]> {
    const admin = await this.getAdmin()
    return (await admin.listTopics()).filter(t => !isInternal(t)).sort()
  }

  async execute(stmt: string, opts: ExecuteOptions): Promise<ResultEnvelope> {
    const parts = stmt.trim().split(/\s+/)
    const cmd = (parts[0] ?? '').toLowerCase()
    const started = Date.now()
    const done = (columns: { name: string }[], rows: unknown[][], warnings: string[] = []): ResultEnvelope =>
      ({ columns, rows, rowCount: rows.length, elapsedMs: Date.now() - started, warnings })

    if (cmd === 'topics' || cmd === 'list') {
      const admin = await this.getAdmin()
      const names = await this.topicNames()
      const meta = names.length ? await admin.fetchTopicMetadata({ topics: names }) : { topics: [] }
      const parts = new Map(meta.topics.map(t => [t.name, t.partitions.length]))
      return done([{ name: 'topic' }, { name: 'partitions' }], names.map(n => [n, parts.get(n) ?? 0]))
    }

    if (cmd === 'describe') {
      const topic = parts[1]
      if (!topic) throw new Error('usage: describe <topic>')
      const admin = await this.getAdmin()
      const meta = await admin.fetchTopicMetadata({ topics: [topic] })
      const offsets = await admin.fetchTopicOffsets(topic)
      const byPart = new Map(offsets.map(o => [o.partition, o]))
      const rows = (meta.topics[0]?.partitions ?? []).map(p => [
        p.partitionId, p.leader, p.replicas.join(','), byPart.get(p.partitionId)?.low, byPart.get(p.partitionId)?.high,
      ])
      return done([{ name: 'partition' }, { name: 'leader' }, { name: 'replicas' }, { name: 'earliest' }, { name: 'latest' }], rows)
    }

    if (cmd === 'consume' || cmd === 'tail') {
      const topic = parts[1]
      if (!topic) throw new Error('usage: consume <topic> [n]')
      const n = Math.min(parts[2] ? Math.max(0, Number(parts[2])) : opts.pageSize, opts.pageSize)
      const rows = await this.tail(topic, n)
      return done(
        [{ name: 'partition' }, { name: 'offset' }, { name: 'key' }, { name: 'value' }, { name: 'timestamp' }],
        rows,
      )
    }

    throw new Error(`unknown command '${cmd}' — use: topics | describe <topic> | consume <topic> [n]`)
  }

  // Tail the last n messages per partition: seek back from the high watermark and
  // collect until we have them all or a short idle timeout elapses.
  private async tail(topic: string, n: number): Promise<unknown[][]> {
    const admin = await this.getAdmin()
    const offsets = await admin.fetchTopicOffsets(topic)
    const want = new Map<number, { start: number; high: number }>()
    let total = 0
    for (const o of offsets) {
      const high = Number(o.high)
      const take = Math.max(0, Math.min(n, high - Number(o.low)))
      want.set(o.partition, { start: high - take, high })
      total += take
    }
    if (total === 0) return []

    const consumer = this.kafka!.consumer({ groupId: `rowboat-tail-${topic}-${Date.now()}` })
    const collected: { partition: number; offset: number; key: string | null; value: string | null; ts: string }[] = []
    await consumer.connect()
    try {
      await consumer.subscribe({ topic, fromBeginning: false })
      await consumer.run({
        eachMessage: async ({ partition, message }) => {
          const w = want.get(partition)
          const offset = Number(message.offset)
          if (w && offset >= w.start && offset < w.high) {
            collected.push({
              partition, offset,
              key: message.key ? message.key.toString() : null,
              value: message.value ? message.value.toString() : null,
              ts: new Date(Number(message.timestamp)).toISOString(),
            })
          }
        },
      })
      for (const [partition, w] of want) consumer.seek({ topic, partition, offset: String(w.start) })
      const deadline = Date.now() + 5000
      while (collected.length < total && Date.now() < deadline) await sleep(100)
    } finally {
      await consumer.disconnect().catch(() => {})
    }
    collected.sort((a, b) => a.partition - b.partition || a.offset - b.offset)
    return collected.map(m => [m.partition, m.offset, m.key, m.value, m.ts])
  }

  async getChildren(node: TreeNode | null): Promise<TreeNode[]> {
    if (node === null) {
      const names = await this.topicNames()
      return names.map(name => ({ id: kfNodeId(name), label: name, kind: 'table', hasChildren: true }))
    }
    if (node.kind === 'table') {
      const [topic] = parseKfNodeId(node.id)
      const admin = await this.getAdmin()
      const meta = await admin.fetchTopicMetadata({ topics: [topic] })
      return (meta.topics[0]?.partitions ?? []).map(p => ({
        id: kfNodeId(topic, String(p.partitionId)), label: `partition ${p.partitionId}`,
        kind: 'column', hasChildren: false, detail: `leader ${p.leader}`,
      }))
    }
    return []
  }

  async searchItems(kind: ItemKind, prefix: string): Promise<SchemaItem[]> {
    if (kind === 'table') {
      return (await this.topicNames())
        .filter(name => name.startsWith(prefix)).slice(0, 50)
        .map(name => ({ kind: 'table', name }))
    }
    return []
  }

  async dispose() {
    await this.admin?.disconnect().catch(() => {})
    this.admin = undefined
    this.kafka = undefined
  }
}

export const kafkaFactory: AdapterFactory = {
  id: 'kafka',
  validate(raw) {
    return typeof raw.host === 'string' && raw.host !== '' ? [] : ['host is required']
  },
  requiredSecrets() {
    return []
  },
  create(cfg) {
    return new KafkaAdapter(cfg)
  },
}
