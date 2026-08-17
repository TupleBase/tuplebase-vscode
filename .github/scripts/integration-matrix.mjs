// Emits the integration matrix for ci.yml, filtered to the adapters this release
// actually ships (ENABLED_ADAPTER_IDS in src/adapters/registry.ts). A disabled
// adapter is invisible to users, so booting its container on every push burns CI
// minutes for nothing. Enabling an id there adds its job here automatically.
//
// Usage: node .github/scripts/integration-matrix.mjs >> "$GITHUB_OUTPUT"
import { readFileSync } from 'node:fs'

// engine: matrix job name · db: dev/db.mjs service · tests: vitest paths
// SQLite is absent on purpose — file-based, so its IT runs in the unit job.
const ENGINES = [
  { engine: 'postgres',      db: 'postgres',      tests: 'tests/integration/adapters/postgres/adapter.it.test.ts' },
  { engine: 'mysql',         db: 'mysql',         tests: 'tests/integration/adapters/mysql/adapter.it.test.ts' },
  { engine: 'mariadb',       db: 'mariadb',       tests: 'tests/integration/adapters/mysql/mariadb.it.test.ts' },
  { engine: 'redis',         db: 'redis',         tests: 'tests/integration/adapters/redis/adapter.it.test.ts' },
  { engine: 'dynamodb',      db: 'dynamo',        tests: 'tests/integration/adapters/dynamodb/adapter.it.test.ts' },
  { engine: 'mssql',         db: 'mssql',         tests: 'tests/integration/adapters/mssql/adapter.it.test.ts' },
  { engine: 'clickhouse',    db: 'clickhouse',    tests: 'tests/integration/adapters/clickhouse/adapter.it.test.ts' },
  { engine: 'cassandra',     db: 'cassandra',     tests: 'tests/integration/adapters/cassandra/adapter.it.test.ts' },
  { engine: 'neo4j',         db: 'neo4j',         tests: 'tests/integration/adapters/neo4j/adapter.it.test.ts' },
  { engine: 'mongodb',       db: 'mongodb',       tests: 'tests/integration/adapters/mongodb/adapter.it.test.ts' },
  { engine: 'elasticsearch', db: 'elasticsearch', tests: 'tests/integration/adapters/elasticsearch/adapter.it.test.ts' },
  { engine: 'kafka',         db: 'kafka',         tests: 'tests/integration/adapters/kafka/adapter.it.test.ts' },
]

const registry = readFileSync('src/adapters/registry.ts', 'utf8')
const list = registry.match(/const ENABLED_ADAPTER_IDS\s*=\s*\[([^\]]*)\]/)
if (!list) {
  throw new Error('ENABLED_ADAPTER_IDS not found in src/adapters/registry.ts — update this script if the declaration moved')
}
const enabled = [...list[1].matchAll(/['"]([^'"]+)['"]/g)].map(m => m[1])

// An enabled adapter with no matrix entry would silently lose integration
// coverage; SQLite is the one legitimate exception.
const missing = enabled.filter(id => id !== 'sqlite' && !ENGINES.some(e => e.engine === id))
if (missing.length) {
  throw new Error(`enabled adapters missing from the integration matrix: ${missing.join(', ')}`)
}

const include = ENGINES.filter(e => enabled.includes(e.engine))
console.log(`include=${JSON.stringify(include)}`)
console.error(`enabled: ${enabled.join(', ')} → ${include.length} integration job(s)`)
