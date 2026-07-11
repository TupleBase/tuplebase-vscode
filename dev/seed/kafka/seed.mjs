// Seed the dev Kafka broker (wired into `npm run db:kafka`). Waits for the broker,
// creates the `crew` topic and produces three messages.
import { Kafka, logLevel } from 'kafkajs'

const kafka = new Kafka({
  clientId: 'seed', brokers: ['localhost:9092'], logLevel: logLevel.NOTHING,
  retry: { retries: 10, initialRetryTime: 1000 },
})

const admin = kafka.admin()
let ready = false
for (let i = 0; i < 60 && !ready; i++) {
  try { await admin.connect(); ready = true } catch { await new Promise(r => setTimeout(r, 2000)) }
}
if (!ready) throw new Error('kafka broker did not become ready')
await admin.createTopics({ topics: [{ topic: 'crew', numPartitions: 1 }] }).catch(() => {})
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
await producer.disconnect()
console.log('seeded kafka: crew (3 messages)')
