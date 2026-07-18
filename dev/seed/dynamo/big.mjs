// Large dataset for exercising results paging / grid volume.
// Runs as the second half of the standard seed: `npm run db:seed -- dynamo`
import {
  BatchWriteItemCommand,
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ListTablesCommand,
} from '@aws-sdk/client-dynamodb'

const client = new DynamoDBClient({
  endpoint: 'http://localhost:8000',
  region: 'local',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
})

const TableName = 'pagination_demo'
const COUNT = 2000

async function waitForPort(retries = 20) {
  for (let attempt = 0; ; attempt++) {
    try {
      await client.send(new ListTablesCommand({ Limit: 1 }))
      return
    } catch (error) {
      if (attempt >= retries) throw error
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }
}

async function waitActive(retries = 20) {
  for (let attempt = 0; ; attempt++) {
    const { Table } = await client.send(new DescribeTableCommand({ TableName }))
    if (Table?.TableStatus === 'ACTIVE') return
    if (attempt >= retries) throw new Error('table did not become ACTIVE')
    await new Promise(resolve => setTimeout(resolve, 250))
  }
}

await waitForPort()

try {
  await client.send(new DeleteTableCommand({ TableName }))
} catch (error) {
  if (error.name !== 'ResourceNotFoundException') throw error
}

await client.send(new CreateTableCommand({
  TableName,
  AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
  KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
  BillingMode: 'PAY_PER_REQUEST',
}))
await waitActive()

for (let start = 0; start < COUNT; start += 25) {
  const items = []
  for (let i = start; i < Math.min(start + 25, COUNT); i++) {
    items.push({
      PutRequest: {
        Item: {
          id: { S: `item-${i}` },
          label: { S: `row-${i}` },
          bucket: { N: String(i % 50) },
          amount: { N: String((i * 7) % 1000) },
        },
      },
    })
  }
  await client.send(new BatchWriteItemCommand({ RequestItems: { [TableName]: items } }))
}

console.log(`seeded ${COUNT} items into ${TableName}`)
