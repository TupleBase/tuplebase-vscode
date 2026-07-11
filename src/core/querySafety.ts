const REDIS_READ_COMMANDS = new Set([
  'GET', 'MGET', 'HGET', 'HGETALL', 'HEXISTS', 'HLEN', 'HKEYS', 'HVALS', 'LRANGE', 'LLEN',
  'SCARD', 'SISMEMBER', 'SMEMBERS', 'SRANDMEMBER', 'ZRANGE', 'ZRANGEBYSCORE', 'ZSCORE', 'ZCARD',
  'XRANGE', 'XREVRANGE', 'XLEN', 'SCAN', 'SSCAN', 'HSCAN', 'ZSCAN', 'TYPE', 'EXISTS', 'TTL',
  'PTTL', 'STRLEN', 'DBSIZE', 'INFO', 'PING', 'TIME',
])

// SQL-family DML/DDL write keywords. Postgres, MySQL, SQLite, SQL Server,
// ClickHouse and Cassandra (CQL) all start writes with one of these — anything
// else (SELECT/WITH/SHOW/DESCRIBE/EXPLAIN/…) is a read.
const SQL_WRITE = new Set([
  'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'GRANT', 'REVOKE',
  'MERGE', 'CALL', 'DO', 'COPY', 'VACUUM', 'ANALYZE', 'REFRESH', 'RENAME', 'REPLACE',
  'UPSERT', 'EXEC', 'EXECUTE', 'OPTIMIZE', 'SET', 'LOAD', 'BATCH', 'BEGIN', 'COMMIT',
])
const SQL_ADAPTERS = new Set(['postgres', 'mysql', 'sqlite', 'mssql', 'clickhouse', 'cassandra'])

// Cypher puts write clauses after a leading MATCH (e.g. `MATCH (n) DETACH DELETE n`),
// so a write is detected anywhere in the statement, not just at the first keyword.
const CYPHER_WRITE = /\b(create|merge|delete|detach|set|remove|foreach|drop|load\s+csv)\b/i

// MongoDB collection methods that only read (db.coll.<method>(…)); anything else
// (insert/update/delete/replace/drop/createIndex/…) mutates.
const MONGO_READ_METHODS = new Set([
  'find', 'findone', 'aggregate', 'count', 'countdocuments', 'estimateddocumentcount', 'distinct',
])

// Elasticsearch / Kafka commands begin with an HTTP-ish or command verb.
const ES_READ_VERBS = new Set(['GET', 'HEAD', 'SEARCH'])
const KAFKA_READ_VERBS = new Set(['TOPICS', 'CONSUME', 'DESCRIBE', 'TAIL', 'LIST'])

function firstKeyword(statement: string): string {
  return statement.replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/, '').match(/^\w+/)?.[0]?.toUpperCase() ?? ''
}

// the method in a `db.collection.method(...)` mongo command, lower-cased
function mongoMethod(statement: string): string {
  return /\.\s*(\w+)\s*\(/.exec(statement)?.[1]?.toLowerCase() ?? ''
}

export function isWriteStatement(adapter: string, statement: string): boolean {
  const keyword = firstKeyword(statement)
  if (adapter === 'redis') return !REDIS_READ_COMMANDS.has(keyword)
  if (adapter === 'dynamodb') return ['INSERT', 'UPDATE', 'DELETE'].includes(keyword)
  if (adapter === 'neo4j') return CYPHER_WRITE.test(statement)
  if (adapter === 'mongodb') return !MONGO_READ_METHODS.has(mongoMethod(statement))
  if (adapter === 'elasticsearch') return !ES_READ_VERBS.has(keyword)
  if (adapter === 'kafka') return !KAFKA_READ_VERBS.has(keyword)
  if (SQL_ADAPTERS.has(adapter)) return SQL_WRITE.has(keyword)
  return true
}
