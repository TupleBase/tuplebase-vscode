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
