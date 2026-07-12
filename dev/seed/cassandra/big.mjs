// Opt-in large dataset for exercising results paging / grid volume.
// Run with: npm run db:seed:big  (or `npm run db:seed:big -- cassandra`)
import cassandra from 'cassandra-driver'

const client = new cassandra.Client({
  contactPoints: ['127.0.0.1:9042'],
  localDataCenter: 'datacenter1',
})
await client.connect()
await client.execute(
  "create keyspace if not exists rowboat with replication = {'class':'SimpleStrategy','replication_factor':1}",
)
await client.execute('drop table if exists rowboat.pagination_demo')
await client.execute(
  'create table rowboat.pagination_demo (id int primary key, label text, bucket int, amount double, created_at timestamp)',
)

const COUNT = 2000
const CONCURRENCY = 50
const now = Date.now()
for (let start = 1; start <= COUNT; start += CONCURRENCY) {
  const batch = []
  for (let i = start; i < start + CONCURRENCY && i <= COUNT; i++) {
    batch.push(client.execute(
      'insert into rowboat.pagination_demo (id, label, bucket, amount, created_at) values (?, ?, ?, ?, ?)',
      [i, `row-${i}`, i % 50, (i * 7) % 1000, new Date(now - i * 60000)],
      { prepare: true },
    ))
  }
  await Promise.all(batch)
}
await client.shutdown()
console.log(`seeded cassandra big: rowboat.pagination_demo (${COUNT} rows)`)
