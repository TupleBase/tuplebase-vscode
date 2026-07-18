import type { AdapterPresentation } from '../types'
import { SQL_WRITE_KEYWORDS } from '../sqlWriteKeywords'

// Eager data only — no driver import, so the registry can carry this without
// loading the postgres adapter code.
export const presentation: AdapterPresentation = {
  id: 'postgres',
  label: 'PostgreSQL',
  codicon: 'database',
  emoji: '🐘',
  blurb: 'Relational · SQL',
  iconFile: 'postgres.svg',
  languageId: 'sql',
  statementSyntax: 'sql',
  completionTriggers: ['.', ' ', '"'],
  passwordSecret: true,
  writeRule: { mode: 'firstKeywordIn', keywords: SQL_WRITE_KEYWORDS },
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
}
