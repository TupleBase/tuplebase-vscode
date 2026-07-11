import type { AdapterDescriptor } from '../types'
import { redisFactory } from './adapter'
import { redisCompletion } from './completion'

export const redis: AdapterDescriptor = {
  presentation: {
    id: 'redis',
    label: 'Redis',
    codicon: 'zap',
    emoji: '⚡',
    blurb: 'Key-value · commands',
    iconFile: 'redis.svg',
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
  },
  factory: redisFactory,
  completion: redisCompletion,
}
