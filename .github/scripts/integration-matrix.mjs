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
  { engine: 'postgres',      db: 'postgres',      tests: 'src/adapters/postgres' },
  { engine: 'mysql',         db: 'mysql',         tests: 'src/adapters/mysql/adapter.it.test.ts src/adapters/mysql/adapter.test.ts' },
  { engine: 'mariadb',       db: 'mariadb',       tests: 'src/adapters/mysql/mariadb.it.test.ts' },
  { engine: 'redis',         db: 'redis',         tests: 'src/adapters/redis' },
  { engine: 'dynamodb',      db: 'dynamo',        tests: 'src/adapters/dynamodb' },
  { engine: 'mssql',         db: 'mssql',         tests: 'src/adapters/mssql' },
  { engine: 'clickhouse',    db: 'clickhouse',    tests: 'src/adapters/clickhouse' },
  { engine: 'cassandra',     db: 'cassandra',     tests: 'src/adapters/cassandra' },
  { engine: 'neo4j',         db: 'neo4j',         tests: 'src/adapters/neo4j' },
  { engine: 'mongodb',       db: 'mongodb',       tests: 'src/adapters/mongodb' },
  { engine: 'elasticsearch', db: 'elasticsearch', tests: 'src/adapters/elasticsearch' },
  { engine: 'kafka',         db: 'kafka',         tests: 'src/adapters/kafka' },
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
