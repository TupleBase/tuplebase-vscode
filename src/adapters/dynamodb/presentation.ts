import type { AdapterPresentation } from '../types'

export const presentation: AdapterPresentation = {
  id: 'dynamodb',
  label: 'DynamoDB',
  codicon: 'cloud',
  emoji: '🟧',
  blurb: 'AWS · PartiQL',
  iconFile: 'dynamodb.svg',
  languageId: 'sql',
  statementSyntax: 'partiql',
  completionTriggers: ['.', ' ', '"'],
  writeRule: { mode: 'firstKeywordIn', keywords: ['INSERT', 'UPDATE', 'DELETE'] },
  fields: [
    { key: 'region', label: 'Region', kind: 'text', required: true },
    { key: 'profile', label: 'AWS profile', kind: 'text' },
    {
      key: 'endpoint', label: 'Endpoint', kind: 'text',
      description: 'Custom endpoint, e.g. http://localhost:8000 for dynamodb-local',
    },
  ],
}
