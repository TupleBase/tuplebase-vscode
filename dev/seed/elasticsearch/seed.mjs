// Seed the dev Elasticsearch container. No initdb hook + no healthcheck, so this
// waits for the HTTP port, then (re)creates the index (wired into `npm run db:elasticsearch`).
import { Client } from '@elastic/elasticsearch'

const client = new Client({ node: 'http://localhost:9200' })

let ready = false
for (let i = 0; i < 60 && !ready; i++) {
  try { await client.cluster.health(); ready = true } catch { await new Promise(r => setTimeout(r, 2000)) }
}
if (!ready) throw new Error('elasticsearch did not become ready')

await client.indices.delete({ index: 'crew' }, { ignore: [404] }).catch(() => {})
await client.indices.create({
  index: 'crew',
  mappings: { properties: { id: { type: 'integer' }, name: { type: 'keyword' }, role: { type: 'keyword' } } },
})
await client.bulk({
  refresh: true,
  operations: [
    { index: { _index: 'crew', _id: '1' } }, { id: 1, name: 'ada', role: 'captain' },
    { index: { _index: 'crew', _id: '2' } }, { id: 2, name: 'grace', role: 'navigator' },
    { index: { _index: 'crew', _id: '3' } }, { id: 3, name: 'hedy', role: 'engineer' },
  ],
})
console.log('seeded elasticsearch: crew (3 docs)')
