import type { AdapterPresentation } from '../types'
import { SQL_WRITE_KEYWORDS } from '../sqlWriteKeywords'

export const presentation: AdapterPresentation = {
  id: 'mysql',
  label: 'MySQL',
  codicon: 'database',
  emoji: '🐬',
  blurb: 'Relational · SQL',
  iconFile: 'mysql.svg',
  languageId: 'sql',
  statementSyntax: 'sql',
  completionTriggers: ['.', ' ', '"'],
  passwordSecret: true,
  writeRule: { mode: 'firstKeywordIn', keywords: SQL_WRITE_KEYWORDS },
  tableParent: 'schema',
  fields: [
    { key: 'host', label: 'Host', kind: 'text', required: true, default: 'localhost' },
    { key: 'port', label: 'Port', kind: 'number', default: 3306 },
    { key: 'database', label: 'Database', kind: 'text', required: true },
    { key: 'user', label: 'User', kind: 'text', required: true },
    {
      key: 'sslmode', label: 'SSL mode', kind: 'select',
      options: ['', 'disable', 'require', 'verify-ca', 'verify-full'],
      description: 'TLS mode: require encrypts without certificate checks, verify-ca checks the CA, verify-full checks the CA and hostname',
    },
    {
      key: 'sslrootcert', label: 'SSL root cert', kind: 'text',
      description: 'Absolute path to the CA certificate for verify-ca/verify-full (use ${env:VAR} for machine-specific paths)',
    },
  ],
}
