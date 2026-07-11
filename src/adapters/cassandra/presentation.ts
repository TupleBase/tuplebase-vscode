import type { AdapterPresentation } from '../types'
import { SQL_WRITE_KEYWORDS } from '../sqlWriteKeywords'

export const presentation: AdapterPresentation = {
  id: 'cassandra',
  label: 'Cassandra',
  codicon: 'server',
  emoji: '🟦',
  blurb: 'Wide-column · CQL',
  iconFile: 'cassandra.svg',
  languageId: 'sql',
  statementSyntax: 'sql',
  completionTriggers: ['.', ' ', '"'],
  passwordSecret: true,
  writeRule: { mode: 'firstKeywordIn', keywords: SQL_WRITE_KEYWORDS },
  fields: [
    { key: 'host', label: 'Host', kind: 'text', required: true, default: 'localhost' },
    { key: 'port', label: 'Port', kind: 'number', default: 9042 },
    { key: 'datacenter', label: 'Local datacenter', kind: 'text', required: true, default: 'datacenter1' },
    { key: 'keyspace', label: 'Keyspace', kind: 'text', description: 'Default keyspace for unqualified queries (optional).' },
    { key: 'user', label: 'User', kind: 'text', description: 'Only used when Password auth is enabled.' },
    {
      key: 'auth', label: 'Password auth', kind: 'checkbox', default: false,
      description: 'Prompt for a password on first connect (stored in the OS keychain, never in this file)',
    },
  ],
}
