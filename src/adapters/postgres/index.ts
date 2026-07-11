import type { AdapterDescriptor } from '../types'
import { postgresFactory } from './adapter'
import { postgresCompletion } from './completion'

// Everything the host needs to offer PostgreSQL, in one descriptor. Register it
// by adding this to src/adapters/registry.ts — nothing else edits per-adapter.
export const postgres: AdapterDescriptor = {
  presentation: {
    id: 'postgres',
    label: 'PostgreSQL',
    codicon: 'database',
    emoji: '🐘',
    blurb: 'Relational · SQL',
    iconFile: 'postgres.svg',
    fields: [
      { key: 'host', label: 'Host', kind: 'text', required: true, default: 'localhost' },
      { key: 'port', label: 'Port', kind: 'number', default: 5432 },
      { key: 'database', label: 'Database', kind: 'text', required: true },
      { key: 'user', label: 'User', kind: 'text', required: true },
      {
        key: 'sslmode', label: 'SSL mode', kind: 'select',
        options: ['', 'disable', 'require', 'verify-ca', 'verify-full'],
        description: 'TLS mode (libpq semantics): require encrypts without certificate checks, verify-ca checks the CA but not the hostname, verify-full checks both',
      },
      {
        key: 'sslrootcert', label: 'SSL root cert', kind: 'text',
        description: 'Absolute path to the CA certificate for verify-ca/verify-full (use ${env:VAR} for machine-specific paths)',
      },
    ],
  },
  factory: postgresFactory,
  completion: postgresCompletion,
}
