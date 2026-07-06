// Seed data for dynamodb-local — run by `npm run db:seed`.
import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
  PutItemCommand,
} from '@aws-sdk/client-dynamodb'

const client = new DynamoDBClient({
  endpoint: 'http://localhost:8000',
  region: 'local',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
})

// dynamodb-local has no healthcheck (see docker-compose.yml) — retry until the port answers
async function waitForPort(retries = 20) {
  for (let i = 0; ; i++) {
    try {
      await client.send(new DeleteTableCommand({ TableName: 'voyages' }))
      return
    } catch (e) {
      if (e.name === 'ResourceNotFoundException') return
      if (i >= retries) throw e
      await new Promise(r => setTimeout(r, 500))
    }
  }
}

await waitForPort()

await client.send(new CreateTableCommand({
  TableName: 'voyages',
  AttributeDefinitions: [
    { AttributeName: 'crew_name', AttributeType: 'S' },
    { AttributeName: 'departed_at', AttributeType: 'S' },
    { AttributeName: 'destination', AttributeType: 'S' },
  ],
  KeySchema: [
    { AttributeName: 'crew_name', KeyType: 'HASH' },
    { AttributeName: 'departed_at', KeyType: 'RANGE' },
  ],
  GlobalSecondaryIndexes: [{
    IndexName: 'by-destination',
    KeySchema: [{ AttributeName: 'destination', KeyType: 'HASH' }],
    Projection: { ProjectionType: 'ALL' },
  }],
  BillingMode: 'PAY_PER_REQUEST',
}))

const items = [
  { crew_name: 'ada', departed_at: '2026-07-04T09:00:00Z', destination: 'upstream', oars: 2 },
  { crew_name: 'linus', departed_at: '2026-07-05T09:00:00Z', destination: 'downstream', oars: 4 },
  { crew_name: 'grace', departed_at: '2026-07-06T09:00:00Z', destination: 'delta', oars: 2 },
]
for (const it of items) {
  await client.send(new PutItemCommand({
    TableName: 'voyages',
    Item: {
      crew_name: { S: it.crew_name },
      departed_at: { S: it.departed_at },
      destination: { S: it.destination },
      oars: { N: String(it.oars) },
    },
  }))
}

console.log(`seeded dynamodb-local: voyages (${items.length} items)`)
