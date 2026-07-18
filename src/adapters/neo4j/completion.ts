import type { CompletionContext, CompletionContribution, CompletionResult } from '../types'

// Cypher clause keywords (multi-word entries insert as a single token)
export const CYPHER_KEYWORDS = [
  'MATCH', 'OPTIONAL MATCH', 'WHERE', 'RETURN', 'WITH', 'ORDER BY', 'SKIP', 'LIMIT',
  'CREATE', 'MERGE', 'SET', 'DELETE', 'DETACH DELETE', 'REMOVE', 'UNWIND', 'FOREACH',
  'CALL', 'YIELD', 'AS', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL', 'DISTINCT', 'ASC', 'DESC',
]
export const CYPHER_FUNCTIONS = ['count', 'collect', 'sum', 'avg', 'min', 'max', 'size', 'keys', 'labels', 'type', 'id']

export const neo4jCompletion: CompletionContribution = {
  async provide(ctx: CompletionContext): Promise<CompletionResult[]> {
    if (!ctx.connected) return []
    const prefix = /([A-Za-z_]\w*)$/.exec(ctx.linePrefix)?.[1] ?? ''
    // after a ':' the user is typing a node label — offer only labels
    const afterColon = /:\s*\w*$/.test(ctx.linePrefix)
    const labels = (await ctx.search('table', prefix)).map((t): CompletionResult => ({ label: t.name, insertText: t.name, kind: 'table' }))
    if (afterColon) return labels
    const props = (await ctx.search('column', prefix)).map((c): CompletionResult =>
      ({ label: c.name, insertText: c.name, kind: 'column', ...(c.detail ? { detail: c.detail } : {}) }))
    return [
      ...labels,
      ...props,
      ...CYPHER_KEYWORDS.map((label): CompletionResult => ({ label, insertText: label, kind: 'keyword' })),
      ...CYPHER_FUNCTIONS.map((name): CompletionResult => ({ label: name, insertText: name, kind: 'function' })),
    ]
  },
}
