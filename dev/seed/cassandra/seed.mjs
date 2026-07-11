// Seed the dev Cassandra container. The image has no initdb hook, so this runs
// after the container is healthy (wired into `npm run db:cassandra`).
import cassandra from 'cassandra-driver'

const client = new cassandra.Client({
  contactPoints: ['127.0.0.1:9042'],
  localDataCenter: 'datacenter1',
})
await client.connect()
await client.execute(
  "create keyspace if not exists rowboat with replication = {'class':'SimpleStrategy','replication_factor':1}",
)
await client.execute('create table if not exists rowboat.crew (id int primary key, name text, role text)')
for (const [id, name, role] of [[1, 'ada', 'captain'], [2, 'grace', 'navigator'], [3, 'hedy', 'engineer']]) {
  await client.execute('insert into rowboat.crew (id, name, role) values (?, ?, ?)', [id, name, role], { prepare: true })
}
await client.shutdown()
console.log('seeded cassandra: rowboat.crew (3 rows)')
