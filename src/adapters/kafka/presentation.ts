import type { AdapterPresentation } from '../types'

export const presentation: AdapterPresentation = {
  id: 'kafka',
  label: 'Kafka',
  codicon: 'broadcast',
  emoji: '📨',
  blurb: 'Streaming · topics',
  iconFile: 'kafka.svg',
  languageId: 'sql',
  statementSyntax: 'kafka',
  completionTriggers: [' '],
  // write ⇔ the command is not one of the read/browse commands
  writeRule: { mode: 'firstKeywordNotIn', keywords: ['TOPICS', 'DESCRIBE', 'CONSUME', 'TAIL', 'LIST'] },
  fields: [
    { key: 'host', label: 'Broker host', kind: 'text', required: true, default: 'localhost' },
    { key: 'port', label: 'Broker port', kind: 'number', default: 9092 },
  ],
}
