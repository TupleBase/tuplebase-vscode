import type { AdapterPresentation } from '../types'

export const presentation: AdapterPresentation = {
  id: 'elasticsearch',
  label: 'Elasticsearch',
  codicon: 'search',
  emoji: '🔍',
  blurb: 'Search · query DSL',
  iconFile: 'elasticsearch.svg',
  languageId: 'sql',
  statementSyntax: 'sql',
  completionTriggers: [' ', '/'],
  passwordSecret: true,
  // write ⇔ the HTTP method is not a read verb
  writeRule: { mode: 'firstKeywordNotIn', keywords: ['GET', 'HEAD'] },
  fields: [
    { key: 'host', label: 'Host', kind: 'text', required: true, default: 'localhost' },
    { key: 'port', label: 'Port', kind: 'number', default: 9200 },
    { key: 'tls', label: 'HTTPS', kind: 'checkbox', default: false, description: 'Use TLS (the server certificate is not verified).' },
    { key: 'user', label: 'User', kind: 'text', description: 'Only used when Password auth is enabled.' },
    {
      key: 'auth', label: 'Password auth', kind: 'checkbox', default: false,
      description: 'Prompt for a password on first connect (stored in the OS keychain, never in this file)',
    },
  ],
}
