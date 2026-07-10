const REDIS_READ_COMMANDS = new Set([
  'GET', 'MGET', 'HGET', 'HGETALL', 'HEXISTS', 'HLEN', 'HKEYS', 'HVALS', 'LRANGE', 'LLEN',
  'SCARD', 'SISMEMBER', 'SMEMBERS', 'SRANDMEMBER', 'ZRANGE', 'ZRANGEBYSCORE', 'ZSCORE', 'ZCARD',
  'XRANGE', 'XREVRANGE', 'XLEN', 'SCAN', 'SSCAN', 'HSCAN', 'ZSCAN', 'TYPE', 'EXISTS', 'TTL',
  'PTTL', 'STRLEN', 'DBSIZE', 'INFO', 'PING', 'TIME',
])

function firstKeyword(statement: string): string {
  return statement.replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/, '').match(/^\w+/)?.[0]?.toUpperCase() ?? ''
}

export function isWriteStatement(adapter: string, statement: string): boolean {
  const keyword = firstKeyword(statement)
  if (adapter === 'redis') return !REDIS_READ_COMMANDS.has(keyword)
  if (adapter === 'dynamodb') return ['INSERT', 'UPDATE', 'DELETE'].includes(keyword)
  if (adapter === 'postgres') {
    return ['INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'GRANT', 'REVOKE', 'MERGE', 'CALL', 'DO', 'COPY', 'VACUUM', 'ANALYZE', 'REFRESH'].includes(keyword)
  }
  return true
}
