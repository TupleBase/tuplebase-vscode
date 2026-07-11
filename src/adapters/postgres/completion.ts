import type { CompletionContext, CompletionContribution, CompletionResult, SchemaItem } from '../types'
import { statementAt } from '../../core/statements'

// offered as plain keyword completions in column position; multi-word entries
// (GROUP BY, ORDER BY) insert as a single token
export const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'LIMIT', 'OFFSET',
  'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON', 'AS', 'AND', 'OR', 'NOT',
  'IN', 'IS', 'NULL', 'DISTINCT', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET',
  'DELETE', 'CREATE', 'ALTER', 'DROP', 'TABLE',
]

export const SQL_FUNCTIONS = ['count', 'sum', 'avg', 'min', 'max', 'now', 'coalesce', 'lower', 'upper']

// FROM/JOIN/INTO/UPDATE/TABLE introduce a table name; the rest merely bound a clause
const TABLE_INTRO = new Set(['from', 'join', 'into', 'update', 'table'])
const CLAUSE_WORDS = new Set([
  ...SQL_KEYWORDS.flatMap(k => k.toLowerCase().split(' ')),
  'having', 'using', 'between', 'like',
])
// keywords that can sit right after a table reference — never an alias
const AFTER_TABLE = 'where|join|inner|left|right|outer|full|cross|natural|on|using|group|order|having|limit|offset|union|except|intersect|set|values|returning|and|or|as'

// what the cursor is positioned to complete within a single SQL statement
export function sqlContext(textBeforeCursor: string): 'table' | 'column' | { alias: string } {
  // `alias.` (optionally trailed by a partial column) right at the cursor
  const aliasDot = /(?:^|[^\w.])([A-Za-z_]\w*)\.\w*$/.exec(textBeforeCursor)
  if (aliasDot) return { alias: aliasDot[1] }
  // nearest recognised keyword wins; unknown words (identifiers) are skipped so
  // 'performed'/'last_updated' never read as FROM/UPDATE
  const words = textBeforeCursor.toLowerCase().match(/[a-z_]\w*/g) ?? []
  for (let i = words.length - 1; i >= 0; i--) {
    if (TABLE_INTRO.has(words[i])) return 'table'
    if (CLAUSE_WORDS.has(words[i])) return 'column'
  }
  return 'column'
}

// the table an alias refers to, read from the statement's FROM/JOIN clauses
export function resolveAlias(statementText: string, alias: string): string | undefined {
  // <from|join> <table> [AS] <alias> — table plain or "quoted", alias optional
  // and never a keyword (so `FROM a JOIN b x` doesn't read JOIN as a's alias)
  const re = new RegExp(
    `\\b(?:from|join)\\s+("[^"]+"|[A-Za-z_]\\w*)(?:\\s+(?:as\\s+)?(?!(?:${AFTER_TABLE})\\b)([A-Za-z_]\\w*))?`,
    'gi',
  )
  const want = alias.toLowerCase()
  let m: RegExpExecArray | null
  while ((m = re.exec(statementText)) !== null) {
    if (m[2] && m[2].toLowerCase() === want) return m[1].replace(/^"|"$/g, '')
  }
  return undefined
}

// the identifier fragment being typed at the cursor (after any qualifying dot)
export function wordPrefix(textBeforeCursor: string): string {
  return /(\w*)$/.exec(textBeforeCursor)?.[1] ?? ''
}

const colDetail = (c: SchemaItem) => [c.parent, c.detail].filter(Boolean).join(': ') || undefined
const tableResult = (i: SchemaItem): CompletionResult =>
  ({ label: i.name, insertText: i.name, kind: 'table', ...(i.parent ? { detail: i.parent } : {}) })
const columnResult = (name: string, detail: string | undefined): CompletionResult =>
  ({ label: name, insertText: name, kind: 'column', ...(detail ? { detail } : {}) })

export const postgresCompletion: CompletionContribution = {
  triggerCharacters: ['.', ' ', '"'],
  async provide(ctx: CompletionContext): Promise<CompletionResult[]> {
    // live adapters only — never connect, never prompt (mirrors redis keys)
    if (!ctx.connected) return []
    const stmt = statementAt(ctx.fullText, ctx.offset, 'sql')
    if (!stmt) return []
    const textBeforeCursor = ctx.fullText.slice(stmt.start, ctx.offset)
    const prefix = wordPrefix(textBeforeCursor)
    const sctx = sqlContext(textBeforeCursor)
    if (sctx === 'table') {
      return (await ctx.search('table', prefix)).map(tableResult)
    }
    if (typeof sctx === 'object') {
      const table = resolveAlias(stmt.text, sctx.alias)
      if (!table) return []
      return (await ctx.search('column', prefix))
        .filter(c => c.parent === table)
        .map(c => columnResult(c.name, c.detail))
    }
    // column position: live columns first, then static keywords and functions
    const cols = (await ctx.search('column', prefix)).map(c => columnResult(c.name, colDetail(c)))
    return [
      ...cols,
      ...SQL_KEYWORDS.map((label): CompletionResult => ({ label, insertText: label, kind: 'keyword' })),
      ...SQL_FUNCTIONS.map((name): CompletionResult => ({ label: name, insertText: name, kind: 'function' })),
    ]
  },
}
