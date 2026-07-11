import type { AdapterPresentation } from '../types'

export const presentation: AdapterPresentation = {
  id: 'redis',
  label: 'Redis',
  codicon: 'zap',
  emoji: '⚡',
  blurb: 'Key-value · commands',
  iconFile: 'redis.svg',
  languageId: 'redis',
  statementSyntax: 'redis',
  completionTriggers: [' '],
  passwordSecret: true,
  // write ⇔ the command is not one of these read-only commands
  writeRule: {
    mode: 'firstKeywordNotIn',
    keywords: [
      'GET', 'MGET', 'HGET', 'HGETALL', 'HEXISTS', 'HLEN', 'HKEYS', 'HVALS', 'LRANGE', 'LLEN',
      'SCARD', 'SISMEMBER', 'SMEMBERS', 'SRANDMEMBER', 'ZRANGE', 'ZRANGEBYSCORE', 'ZSCORE', 'ZCARD',
      'XRANGE', 'XREVRANGE', 'XLEN', 'SCAN', 'SSCAN', 'HSCAN', 'ZSCAN', 'TYPE', 'EXISTS', 'TTL',
      'PTTL', 'STRLEN', 'DBSIZE', 'INFO', 'PING', 'TIME',
    ],
  },
  fields: [
    { key: 'host', label: 'Host', kind: 'text', required: true, default: 'localhost' },
    { key: 'port', label: 'Port', kind: 'number', default: 6379 },
    { key: 'db', label: 'DB', kind: 'number', default: 0 },
    { key: 'tls', label: 'TLS', kind: 'checkbox', default: false },
    { key: 'username', label: 'Username', kind: 'text' },
    {
      key: 'auth', label: 'Password auth', kind: 'checkbox', default: false,
      description: 'Prompt for a password on first connect (stored in the OS keychain, never in this file)',
    },
  ],
}
