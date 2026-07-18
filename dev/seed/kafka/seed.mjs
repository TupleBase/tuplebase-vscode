// Seed the dev Kafka broker (wired into `npm run db:seed -- kafka`). Waits for the broker,
// then (re)creates a few topics and produces messages. Re-running resets the topics.
import { Kafka, logLevel } from 'kafkajs'

const kafka = new Kafka({
  clientId: 'seed', brokers: ['localhost:9092'], logLevel: logLevel.NOTHING,
  // fail fast — `db:kafka` uses --wait, so the broker is already up; short retry
  // avoids long connect-backoff if there's a brief gap between healthy and ready
  retry: { retries: 4, initialRetryTime: 300, maxRetryTime: 2000 },
})

const TOPICS = [
  { topic: 'crew', numPartitions: 1 },
  { topic: 'voyages', numPartitions: 3 },   // multi-partition: describe/consume span partitions
  { topic: 'ports', numPartitions: 1 },
  { topic: 'maintenance', numPartitions: 1 },
]

const admin = kafka.admin()
let ready = false
for (let i = 0; i < 60 && !ready; i++) {
  try { await admin.connect(); ready = true } catch { await new Promise(r => setTimeout(r, 2000)) }
}
if (!ready) throw new Error('kafka broker did not become ready')

// fresh topics each seed: delete, let the async deletion settle, then recreate
await admin.deleteTopics({ topics: TOPICS.map(t => t.topic) }).catch(() => {})
await new Promise(r => setTimeout(r, 1500))
for (let i = 0; i < 5; i++) {
  try { await admin.createTopics({ topics: TOPICS, waitForLeaders: true }); break }
  catch { await new Promise(r => setTimeout(r, 1500)) }
}
await admin.disconnect()

const producer = kafka.producer()
await producer.connect()
await producer.send({
  topic: 'crew',
  messages: [
    { key: '1', value: JSON.stringify({ id: 1, name: 'ada', role: 'captain' }) },
    { key: '2', value: JSON.stringify({ id: 2, name: 'grace', role: 'navigator' }) },
    { key: '3', value: JSON.stringify({ id: 3, name: 'hedy', role: 'engineer' }) },
  ],
})
await producer.send({
  topic: 'voyages',
  messages: [
    { key: 'v1', value: JSON.stringify({ id: 1, boat: 'TupleBase One', status: 'completed', from: 'LIS', to: 'OPO' }) },
    { key: 'v2', value: JSON.stringify({ id: 2, boat: 'TupleBase Two', status: 'completed', from: 'OPO', to: 'VGO' }) },
    { key: 'v3', value: JSON.stringify({ id: 3, boat: 'TupleBase One', status: 'underway', from: 'VGO', to: 'BOD' }) },
    { key: 'v4', value: JSON.stringify({ id: 4, boat: 'Northern Light', status: 'planned', from: 'DUB', to: 'REK' }) },
    { key: 'v5', value: JSON.stringify({ id: 5, boat: 'Tide Turner', status: 'completed', from: 'LIS', to: 'DUB' }) },
    { key: 'v6', value: JSON.stringify({ id: 6, boat: 'TupleBase Two', status: 'cancelled', from: 'BOD', to: 'LIS' }) },
  ],
})
await producer.send({
  topic: 'ports',
  messages: [
    { key: 'LIS', value: JSON.stringify({ code: 'LIS', name: 'Lisbon', country: 'Portugal' }) },
    { key: 'OPO', value: JSON.stringify({ code: 'OPO', name: 'Porto', country: 'Portugal' }) },
    { key: 'VGO', value: JSON.stringify({ code: 'VGO', name: 'Vigo', country: 'Spain' }) },
    { key: 'BOD', value: JSON.stringify({ code: 'BOD', name: 'Bordeaux', country: 'France' }) },
  ],
})
await producer.send({
  topic: 'maintenance',
  messages: [
    { key: 'TB-001', value: JSON.stringify({ boat: 'TupleBase One', category: 'engine', resolved: true }) },
    { key: 'TB-002', value: JSON.stringify({ boat: 'TupleBase Two', category: 'hull', resolved: false }) },
    { key: 'TB-003', value: JSON.stringify({ boat: 'Tide Turner', category: 'rigging', resolved: false }) },
  ],
})
await producer.disconnect()
console.log('seeded kafka: crew (3), voyages (6, 3 partitions), ports (4), maintenance (3)')
