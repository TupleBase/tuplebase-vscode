// Opt-in large dataset for exercising results paging / grid volume.
// Recreates a single-partition `pagedemo` topic so offsets page linearly.
// Run with: npm run db:seed:big  (or `npm run db:seed:big -- kafka`)
import { Kafka, logLevel } from 'kafkajs'

const kafka = new Kafka({
  clientId: 'seed-big', brokers: ['localhost:9092'], logLevel: logLevel.NOTHING,
  retry: { retries: 4, initialRetryTime: 300, maxRetryTime: 2000 },
})

const admin = kafka.admin()
let ready = false
for (let i = 0; i < 60 && !ready; i++) {
  try { await admin.connect(); ready = true } catch { await new Promise(r => setTimeout(r, 2000)) }
}
if (!ready) throw new Error('kafka broker did not become ready')

// fresh topic each seed: delete, let the async deletion settle, then recreate
await admin.deleteTopics({ topics: ['pagedemo'] }).catch(() => {})
await new Promise(r => setTimeout(r, 1500))
for (let i = 0; i < 5; i++) {
  try { await admin.createTopics({ topics: [{ topic: 'pagedemo', numPartitions: 1 }], waitForLeaders: true }); break }
  catch { await new Promise(r => setTimeout(r, 1500)) }
}
await admin.disconnect()

const COUNT = 5000
const producer = kafka.producer()
await producer.connect()
for (let start = 1; start <= COUNT; start += 500) {
  const messages = []
  for (let i = start; i < start + 500 && i <= COUNT; i++) {
    messages.push({ key: String(i), value: JSON.stringify({ id: i, label: `row-${i}`, bucket: i % 50, amount: (i * 7) % 1000 }) })
  }
  await producer.send({ topic: 'pagedemo', messages })
}
await producer.disconnect()
console.log(`seeded kafka big: pagedemo (${COUNT} messages, 1 partition)`)
