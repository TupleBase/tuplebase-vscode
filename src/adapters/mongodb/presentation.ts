import type { AdapterPresentation } from '../types'

export const presentation: AdapterPresentation = {
  id: 'mongodb',
  label: 'MongoDB',
  codicon: 'json',
  emoji: '🍃',
  blurb: 'Document · MQL',
  iconFile: 'mongodb.svg',
  languageId: 'sql',
  statementSyntax: 'sql',
  completionTriggers: ['.', ' '],
  passwordSecret: true,
  fields: [
    { key: 'host', label: 'Host', kind: 'text', required: true, default: 'localhost' },
    { key: 'port', label: 'Port', kind: 'number', default: 27017 },
    { key: 'database', label: 'Database', kind: 'text', required: true },
    { key: 'user', label: 'User', kind: 'text', description: 'Only used when Password auth is enabled.' },
    {
      key: 'auth', label: 'Password auth', kind: 'checkbox', default: false,
      description: 'Prompt for a password on first connect (stored in the OS keychain, never in this file)',
    },
  ],
}
