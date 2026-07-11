import type { AdapterPresentation } from '../types'

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
  fields: [
    { key: 'host', label: 'Host', kind: 'text', required: true, default: 'localhost' },
    { key: 'port', label: 'Port', kind: 'number', default: 3306 },
    { key: 'database', label: 'Database', kind: 'text', required: true },
    { key: 'user', label: 'User', kind: 'text', required: true },
  ],
}
