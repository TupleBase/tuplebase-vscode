// Seed the dev MongoDB container (wired into `npm run db:seed -- mongodb`).
import { MongoClient } from 'mongodb'

const client = new MongoClient('mongodb://localhost:27017')
await client.connect()
const crew = client.db('tuplebase').collection('crew')
await crew.deleteMany({})
await crew.insertMany([
  { id: 1, name: 'ada', role: 'captain' },
  { id: 2, name: 'grace', role: 'navigator' },
  { id: 3, name: 'hedy', role: 'engineer' },
])
await client.close()
console.log('seeded mongodb: tuplebase.crew (3 docs)')
