import type { CompletionContext, CompletionContribution, CompletionResult } from '../types'

export interface RedisCommand { name: string; hint: string; doc: string }

// Own-words command reference — redis.io docs are SSPL-licensed, so wording here
// is original. Hints show argument shape, docs are one-line plain descriptions.
export const REDIS_COMMANDS: RedisCommand[] = [
  { name: 'GET', hint: 'GET key', doc: 'Read the string value stored at a key' },
  { name: 'SET', hint: 'SET key value [EX seconds]', doc: 'Write a string value to a key, optionally with an expiry' },
  { name: 'DEL', hint: 'DEL key [key ...]', doc: 'Remove one or more keys' },
  { name: 'EXISTS', hint: 'EXISTS key [key ...]', doc: 'Count how many of the given keys are present' },
  { name: 'EXPIRE', hint: 'EXPIRE key seconds', doc: 'Set a time-to-live on a key, in seconds' },
  { name: 'TTL', hint: 'TTL key', doc: 'Seconds left before a key expires (-1 no expiry, -2 missing)' },
  { name: 'PERSIST', hint: 'PERSIST key', doc: 'Clear the expiry on a key so it no longer times out' },
  { name: 'TYPE', hint: 'TYPE key', doc: 'Report which data type is stored at a key' },
  { name: 'KEYS', hint: 'KEYS pattern', doc: 'List every key matching a glob pattern (blocks the server; prefer SCAN)' },
  { name: 'SCAN', hint: 'SCAN cursor [MATCH pattern] [COUNT n]', doc: 'Walk the keyspace incrementally, one page per call' },
  { name: 'HGET', hint: 'HGET key field', doc: 'Read one field of a hash' },
  { name: 'HSET', hint: 'HSET key field value [field value ...]', doc: 'Write one or more fields of a hash' },
  { name: 'HGETALL', hint: 'HGETALL key', doc: 'Read every field and value of a hash' },
  { name: 'HDEL', hint: 'HDEL key field [field ...]', doc: 'Remove fields from a hash' },
  { name: 'HKEYS', hint: 'HKEYS key', doc: 'List the field names of a hash' },
  { name: 'HLEN', hint: 'HLEN key', doc: 'Number of fields in a hash' },
  { name: 'LPUSH', hint: 'LPUSH key value [value ...]', doc: 'Prepend values to the head of a list' },
  { name: 'RPUSH', hint: 'RPUSH key value [value ...]', doc: 'Append values to the tail of a list' },
  { name: 'LPOP', hint: 'LPOP key [count]', doc: 'Remove and return elements from the head of a list' },
  { name: 'RPOP', hint: 'RPOP key [count]', doc: 'Remove and return elements from the tail of a list' },
  { name: 'LRANGE', hint: 'LRANGE key start stop', doc: 'Read a slice of a list by index range' },
  { name: 'LLEN', hint: 'LLEN key', doc: 'Number of elements in a list' },
  { name: 'SADD', hint: 'SADD key member [member ...]', doc: 'Add members to a set' },
  { name: 'SREM', hint: 'SREM key member [member ...]', doc: 'Remove members from a set' },
  { name: 'SMEMBERS', hint: 'SMEMBERS key', doc: 'List every member of a set' },
  { name: 'SISMEMBER', hint: 'SISMEMBER key member', doc: 'Check whether a value is a member of a set' },
  { name: 'SCARD', hint: 'SCARD key', doc: 'Number of members in a set' },
  { name: 'ZADD', hint: 'ZADD key score member [score member ...]', doc: 'Add members to a sorted set, each with a score' },
  { name: 'ZRANGE', hint: 'ZRANGE key start stop [WITHSCORES]', doc: 'Read members of a sorted set by rank range' },
  { name: 'ZSCORE', hint: 'ZSCORE key member', doc: 'Read the score of a sorted-set member' },
  { name: 'ZREM', hint: 'ZREM key member [member ...]', doc: 'Remove members from a sorted set' },
  { name: 'INCR', hint: 'INCR key', doc: 'Add 1 to the integer stored at a key' },
  { name: 'DECR', hint: 'DECR key', doc: 'Subtract 1 from the integer stored at a key' },
  { name: 'INCRBY', hint: 'INCRBY key increment', doc: 'Add a given integer to the value stored at a key' },
  { name: 'APPEND', hint: 'APPEND key value', doc: 'Concatenate a value onto the end of a string key' },
  { name: 'STRLEN', hint: 'STRLEN key', doc: 'Length in bytes of the string stored at a key' },
  { name: 'MGET', hint: 'MGET key [key ...]', doc: 'Read several string keys in one call' },
  { name: 'MSET', hint: 'MSET key value [key value ...]', doc: 'Write several string keys in one call' },
  { name: 'SETEX', hint: 'SETEX key seconds value', doc: 'Write a string value together with an expiry in seconds' },
  { name: 'GETDEL', hint: 'GETDEL key', doc: 'Read a string key and remove it in the same step' },
  { name: 'RENAME', hint: 'RENAME key newkey', doc: 'Move a key to a new name, replacing any existing target' },
  { name: 'UNLINK', hint: 'UNLINK key [key ...]', doc: 'Remove keys, reclaiming their memory in the background' },
  { name: 'DBSIZE', hint: 'DBSIZE', doc: 'Number of keys in the current database' },
  { name: 'SELECT', hint: 'SELECT index', doc: 'Switch this connection to another numbered database' },
  { name: 'PING', hint: 'PING [message]', doc: 'Round-trip check that the server is answering' },
  { name: 'INFO', hint: 'INFO [section]', doc: 'Server statistics and status as text' },
  { name: 'CLIENT', hint: 'CLIENT subcommand [args]', doc: 'Inspect or manage client connections' },
  { name: 'CONFIG', hint: 'CONFIG GET|SET parameter [value]', doc: 'Read or change server settings at runtime' },
  { name: 'FLUSHDB', hint: 'FLUSHDB [ASYNC]', doc: 'Delete every key in the current database' },
  { name: 'FLUSHALL', hint: 'FLUSHALL [ASYNC]', doc: 'Delete every key in all databases' },
  { name: 'SUBSCRIBE', hint: 'SUBSCRIBE channel [channel ...]', doc: 'Listen for messages published to the given channels' },
  { name: 'PUBLISH', hint: 'PUBLISH channel message', doc: 'Send a message to every subscriber of a channel' },
]

// where the cursor sits on a redis line: first word -> command, later -> key
export function lineContext(linePrefix: string): 'command' | 'key' | 'none' {
  const trimmed = linePrefix.replace(/^\s+/, '')
  if (trimmed.startsWith('#')) return 'none'
  return /\s/.test(trimmed) ? 'key' : 'command'
}

// the whitespace-delimited token being typed at the end of the line prefix
export function wordPrefix(linePrefix: string): string {
  return linePrefix.split(/\s+/).pop() ?? ''
}

export const redisCompletion: CompletionContribution = {
  async provide(ctx: CompletionContext): Promise<CompletionResult[]> {
    const kind = lineContext(ctx.linePrefix)
    if (kind === 'none') return []
    if (kind === 'command') {
      return REDIS_COMMANDS.map((c): CompletionResult => ({
        label: c.name, insertText: c.name, kind: 'function', detail: c.hint, documentation: c.doc,
      }))
    }
    // key completion: live adapters only — never connect, never prompt
    if (!ctx.connected) return []
    const prefix = wordPrefix(ctx.linePrefix)
    // replace the whole token: redis keys contain ':' which the default word pattern splits on
    const replaceFromChar = ctx.character - prefix.length
    const items = await ctx.search('key', prefix)
    return items.map((i): CompletionResult => ({ label: i.name, insertText: i.name, kind: 'value', replaceFromChar }))
  },
}
