import type { AdapterPresentation } from '../types'
import { SQL_WRITE_KEYWORDS } from '../sqlWriteKeywords'

export const presentation: AdapterPresentation = {
  id: 'clickhouse',
  label: 'ClickHouse',
  codicon: 'graph',
  emoji: '🟡',
  blurb: 'Analytics · SQL',
  iconFile: 'clickhouse.svg',
  languageId: 'sql',
  statementSyntax: 'sql',
  completionTriggers: ['.', ' ', '"'],
  passwordSecret: true,
  writeRule: { mode: 'firstKeywordIn', keywords: SQL_WRITE_KEYWORDS },
  fields: [
    { key: 'host', label: 'Host', kind: 'text', required: true, default: 'localhost' },
    { key: 'port', label: 'Port (HTTP)', kind: 'number', default: 8123 },
    { key: 'database', label: 'Database', kind: 'text', required: true, default: 'default' },
    { key: 'user', label: 'User', kind: 'text', required: true, default: 'default' },
    {
      key: 'auth', label: 'Password auth', kind: 'checkbox', default: false,
      description: 'Prompt for a password on first connect (stored in the OS keychain, never in this file)',
    },
  ],
}
