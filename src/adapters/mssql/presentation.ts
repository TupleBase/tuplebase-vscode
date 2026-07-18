import type { AdapterPresentation } from '../types'
import { SQL_WRITE_KEYWORDS } from '../sqlWriteKeywords'

export const presentation: AdapterPresentation = {
  id: 'mssql',
  label: 'SQL Server',
  codicon: 'database',
  emoji: '🟥',
  blurb: 'Relational · T-SQL',
  iconFile: 'mssql.svg',
  languageId: 'sql',
  statementSyntax: 'sql',
  completionTriggers: ['.', ' ', '"'],
  passwordSecret: true,
  writeRule: { mode: 'firstKeywordIn', keywords: SQL_WRITE_KEYWORDS },
  fields: [
    { key: 'host', label: 'Host', kind: 'text', required: true, default: 'localhost' },
    { key: 'port', label: 'Port', kind: 'number', default: 1433 },
    { key: 'database', label: 'Database', kind: 'text', required: true },
    { key: 'user', label: 'User', kind: 'text', required: true },
    {
      key: 'encrypt', label: 'Encrypt', kind: 'checkbox', default: false,
      description: 'Use TLS for the connection (the server certificate is trusted without CA validation).',
    },
  ],
}
