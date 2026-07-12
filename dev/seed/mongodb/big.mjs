// Opt-in large dataset for exercising results paging / grid volume.
// Run with: npm run db:seed:big  (or `npm run db:seed:big -- mongodb`)
import { MongoClient } from 'mongodb'

const client = new MongoClient('mongodb://localhost:27017')
await client.connect()
const coll = client.db('rowboat').collection('pagination_demo')
await coll.drop().catch(() => {})

const COUNT = 10000
const now = Date.now()
const docs = Array.from({ length: COUNT }, (_, idx) => {
  const i = idx + 1
  return { id: i, label: `row-${i}`, bucket: i % 50, amount: (i * 7) % 1000, created_at: new Date(now - i * 60000) }
})
await coll.insertMany(docs)
await client.close()
console.log(`seeded mongodb big: rowboat.pagination_demo (${COUNT} docs)`)
