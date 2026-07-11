import type { AdapterDescriptor } from '../types'
import { dynamodbFactory } from './adapter'
import { dynamodbCompletion } from './completion'

export const dynamodb: AdapterDescriptor = {
  presentation: {
    id: 'dynamodb',
    label: 'DynamoDB',
    codicon: 'cloud',
    emoji: '🟧',
    blurb: 'AWS · PartiQL',
    iconFile: 'dynamodb.svg',
    fields: [
      { key: 'region', label: 'Region', kind: 'text', required: true },
      { key: 'profile', label: 'AWS profile', kind: 'text' },
      {
        key: 'endpoint', label: 'Endpoint', kind: 'text',
        description: 'Custom endpoint, e.g. http://localhost:8000 for dynamodb-local',
      },
    ],
  },
  factory: dynamodbFactory,
  completion: dynamodbCompletion,
}
