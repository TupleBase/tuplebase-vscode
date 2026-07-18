// Large dataset for exercising results paging / grid volume.
// Runs as the second half of the standard seed: `npm run db:seed -- neo4j`
import neo4j from 'neo4j-driver'

const driver = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('neo4j', 'tuplebasepass'))
const session = driver.session()
await session.run('MATCH (n:PageDemo) DETACH DELETE n')

const COUNT = 10000
for (let start = 1; start <= COUNT; start += 1000) {
  const rows = []
  for (let i = start; i < start + 1000 && i <= COUNT; i++) {
    rows.push({ id: neo4j.int(i), label: `row-${i}`, bucket: neo4j.int(i % 50), amount: (i * 7) % 1000, minutesAgo: neo4j.int(i) })
  }
  await session.run(
    'UNWIND $rows AS row CREATE (:PageDemo {id: row.id, label: row.label, bucket: row.bucket, amount: row.amount, created_at: datetime() - duration({minutes: row.minutesAgo})})',
    { rows },
  )
}
await session.close()
await driver.close()
console.log(`seeded neo4j big: ${COUNT} :PageDemo nodes`)
