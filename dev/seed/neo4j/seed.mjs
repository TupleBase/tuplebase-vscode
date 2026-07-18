// Seed the dev Neo4j container. The image has no initdb hook, so this runs after
// the container is healthy (wired into `npm run db:seed -- neo4j`).
import neo4j from 'neo4j-driver'

const driver = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('neo4j', 'tuplebasepass'))
const session = driver.session()
await session.run('MATCH (n:Crew) DETACH DELETE n')
for (const [id, name, role] of [[1, 'ada', 'captain'], [2, 'grace', 'navigator'], [3, 'hedy', 'engineer']]) {
  await session.run('CREATE (:Crew {id: $id, name: $name, role: $role})', { id: neo4j.int(id), name, role })
}
await session.close()
await driver.close()
console.log('seeded neo4j: 3 :Crew nodes')
