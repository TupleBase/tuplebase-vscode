// Large dataset for exercising results paging / grid volume.
// Runs as the second half of the standard seed: `npm run db:seed -- elasticsearch`
import { Client } from '@elastic/elasticsearch'

const client = new Client({ node: 'http://localhost:9200' })

let ready = false
for (let i = 0; i < 60 && !ready; i++) {
  try { await client.cluster.health(); ready = true } catch { await new Promise(r => setTimeout(r, 2000)) }
}
if (!ready) throw new Error('elasticsearch did not become ready')

await client.indices.delete({ index: 'pagination_demo' }, { ignore: [404] }).catch(() => {})
await client.indices.create({
  index: 'pagination_demo',
  mappings: {
    properties: {
      id: { type: 'integer' },
      label: { type: 'keyword' },
      bucket: { type: 'integer' },
      amount: { type: 'float' },
      created_at: { type: 'date' },
    },
  },
})

const COUNT = 10000
const now = Date.now()
for (let start = 1; start <= COUNT; start += 1000) {
  const operations = []
  for (let i = start; i < start + 1000 && i <= COUNT; i++) {
    operations.push({ index: { _index: 'pagination_demo', _id: String(i) } })
    operations.push({ id: i, label: `row-${i}`, bucket: i % 50, amount: (i * 7) % 1000, created_at: new Date(now - i * 60000).toISOString() })
  }
  await client.bulk({ operations })
}
await client.indices.refresh({ index: 'pagination_demo' })
console.log(`seeded elasticsearch big: pagination_demo (${COUNT} docs)`)
