import type { AdapterPresentation } from '../types'

export const presentation: AdapterPresentation = {
  id: 'neo4j',
  label: 'Neo4j',
  codicon: 'type-hierarchy',
  emoji: '🕸️',
  blurb: 'Graph · Cypher',
  iconFile: 'neo4j.svg',
  languageId: 'sql',
  statementSyntax: 'sql',
  completionTriggers: [' ', ':'],
  passwordSecret: true,
  // Cypher puts the write clause after a leading MATCH, so scan the whole statement
  writeRule: { mode: 'anyKeyword', keywords: ['CREATE', 'MERGE', 'DELETE', 'DETACH', 'SET', 'REMOVE', 'FOREACH', 'DROP', 'LOAD'] },
  fields: [
    { key: 'host', label: 'Host', kind: 'text', required: true, default: 'localhost' },
    { key: 'port', label: 'Bolt port', kind: 'number', default: 7687 },
    { key: 'database', label: 'Database', kind: 'text', default: 'neo4j' },
    { key: 'user', label: 'User', kind: 'text', required: true, default: 'neo4j' },
  ],
}
