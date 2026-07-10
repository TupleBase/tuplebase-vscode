import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
  ListTablesCommand,
  PutItemCommand,
} from '@aws-sdk/client-dynamodb'

const client = new DynamoDBClient({
  endpoint: 'http://localhost:8000',
  region: 'local',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
})

const tableNames = ['voyages', 'crew_profiles', 'maintenance_jobs']

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

async function recreateTables() {
  for (const TableName of tableNames) {
    try {
      await client.send(new DeleteTableCommand({ TableName }))
    } catch (error) {
      if (error.name !== 'ResourceNotFoundException') throw error
    }
  }
}

function stringMap(values) {
  return { M: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { S: value }])) }
}

function stringList(values) {
  return { L: values.map(value => ({ S: value })) }
}

await waitForPort()
await recreateTables()

await client.send(new CreateTableCommand({
  TableName: 'voyages',
  AttributeDefinitions: [
    { AttributeName: 'crew_name', AttributeType: 'S' },
    { AttributeName: 'departed_at', AttributeType: 'S' },
    { AttributeName: 'status', AttributeType: 'S' },
    { AttributeName: 'destination', AttributeType: 'S' },
    { AttributeName: 'boat_id', AttributeType: 'S' },
  ],
  KeySchema: [
    { AttributeName: 'crew_name', KeyType: 'HASH' },
    { AttributeName: 'departed_at', KeyType: 'RANGE' },
  ],
  LocalSecondaryIndexes: [{
    IndexName: 'by-status',
    KeySchema: [
      { AttributeName: 'crew_name', KeyType: 'HASH' },
      { AttributeName: 'status', KeyType: 'RANGE' },
    ],
    Projection: { ProjectionType: 'ALL' },
  }],
  GlobalSecondaryIndexes: [
    {
      IndexName: 'by-destination',
      KeySchema: [{ AttributeName: 'destination', KeyType: 'HASH' }],
      Projection: { ProjectionType: 'ALL' },
    },
    {
      IndexName: 'by-boat-and-time',
      KeySchema: [
        { AttributeName: 'boat_id', KeyType: 'HASH' },
        { AttributeName: 'departed_at', KeyType: 'RANGE' },
      ],
      Projection: { ProjectionType: 'INCLUDE', NonKeyAttributes: ['crew_name', 'destination', 'status'] },
    },
  ],
  BillingMode: 'PAY_PER_REQUEST',
}))

await client.send(new CreateTableCommand({
  TableName: 'crew_profiles',
  AttributeDefinitions: [
    { AttributeName: 'crew_name', AttributeType: 'S' },
    { AttributeName: 'role', AttributeType: 'S' },
    { AttributeName: 'home_port', AttributeType: 'S' },
  ],
  KeySchema: [{ AttributeName: 'crew_name', KeyType: 'HASH' }],
  GlobalSecondaryIndexes: [
    {
      IndexName: 'by-role',
      KeySchema: [{ AttributeName: 'role', KeyType: 'HASH' }],
      Projection: { ProjectionType: 'ALL' },
    },
    {
      IndexName: 'by-home-port',
      KeySchema: [{ AttributeName: 'home_port', KeyType: 'HASH' }],
      Projection: { ProjectionType: 'KEYS_ONLY' },
    },
  ],
  BillingMode: 'PAY_PER_REQUEST',
}))

await client.send(new CreateTableCommand({
  TableName: 'maintenance_jobs',
  AttributeDefinitions: [
    { AttributeName: 'boat_id', AttributeType: 'S' },
    { AttributeName: 'scheduled_for', AttributeType: 'S' },
    { AttributeName: 'priority', AttributeType: 'S' },
    { AttributeName: 'status', AttributeType: 'S' },
  ],
  KeySchema: [
    { AttributeName: 'boat_id', KeyType: 'HASH' },
    { AttributeName: 'scheduled_for', KeyType: 'RANGE' },
  ],
  LocalSecondaryIndexes: [{
    IndexName: 'by-priority',
    KeySchema: [
      { AttributeName: 'boat_id', KeyType: 'HASH' },
      { AttributeName: 'priority', KeyType: 'RANGE' },
    ],
    Projection: { ProjectionType: 'ALL' },
  }],
  GlobalSecondaryIndexes: [{
    IndexName: 'by-status',
    KeySchema: [{ AttributeName: 'status', KeyType: 'HASH' }],
    Projection: { ProjectionType: 'ALL' },
  }],
  BillingMode: 'PAY_PER_REQUEST',
}))

const voyages = [
  ['ada', '2026-07-01T08:00:00Z', 'completed', 'OPO', 'boat-1', 178.4],
  ['ada', '2026-07-08T06:00:00Z', 'planned', 'REK', 'boat-4', 744.1],
  ['linus', '2026-07-03T09:15:00Z', 'completed', 'VGO', 'boat-2', 76.2],
  ['grace', '2026-07-05T07:30:00Z', 'underway', 'BOD', 'boat-1', 412.8],
  ['margaret', '2026-06-20T10:00:00Z', 'completed', 'DUB', 'boat-3', 678.9],
  ['donald', '2026-07-10T11:00:00Z', 'cancelled', 'LIS', 'boat-2', 531.6],
]
for (const [crew_name, departed_at, status, destination, boat_id, distance_nm] of voyages) {
  await client.send(new PutItemCommand({
    TableName: 'voyages',
    Item: {
      crew_name: { S: crew_name }, departed_at: { S: departed_at }, status: { S: status },
      destination: { S: destination }, boat_id: { S: boat_id }, distance_nm: { N: String(distance_nm) },
      checkpoints: stringList(['departure', 'midpoint', 'arrival']),
      weather: stringMap({ summary: status === 'underway' ? 'overcast' : 'clear', wind_knots: '14' }),
      manifest: stringMap({ cargo: 'provisions', handling: 'standard' }),
      tags: { SS: [status, destination.toLowerCase()] },
    },
  }))
}

const profiles = [
  ['ada', 'captain', 'LIS'], ['linus', 'rower', 'OPO'], ['grace', 'navigator', 'LIS'],
  ['margaret', 'engineer', 'BOD'], ['donald', 'deckhand', 'VGO'], ['barbara', 'medic', 'DUB'],
]
for (const [crew_name, role, home_port] of profiles) {
  await client.send(new PutItemCommand({
    TableName: 'crew_profiles',
    Item: {
      crew_name: { S: crew_name }, role: { S: role }, home_port: { S: home_port },
      certifications: { SS: ['safety', 'first-aid'] },
      emergency_contact: stringMap({ name: `${crew_name}-contact`, phone: '+351-555-0100' }),
      preferences: { M: { cabin: { S: role === 'captain' ? 'stern' : 'shared' }, notifications: { BOOL: true } } },
    },
  }))
}

const jobs = [
  ['boat-1', '2026-07-12T09:00:00Z', 'medium', 'scheduled', 'Hull inspection'],
  ['boat-2', '2026-07-11T08:00:00Z', 'high', 'open', 'Stern scrape repair'],
  ['boat-3', '2026-07-09T10:00:00Z', 'high', 'in-progress', 'Rigging overhaul'],
  ['boat-4', '2026-07-14T13:00:00Z', 'low', 'scheduled', 'Engine diagnostics'],
]
for (const [boat_id, scheduled_for, priority, status, summary] of jobs) {
  await client.send(new PutItemCommand({
    TableName: 'maintenance_jobs',
    Item: {
      boat_id: { S: boat_id }, scheduled_for: { S: scheduled_for }, priority: { S: priority }, status: { S: status },
      summary: { S: summary }, assignees: stringList(['margaret', 'donald']),
      estimates: { M: { labor_hours: { N: priority === 'high' ? '8' : '3' }, parts_cost: { N: '250' } } },
    },
  }))
}

console.log(`seeded dynamodb-local: ${tableNames.join(', ')} (${voyages.length + profiles.length + jobs.length} items)`)
