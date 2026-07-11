import type { CompletionContext, CompletionContribution, CompletionResult, SchemaItem } from '../types'
import { statementAt } from '../../core/statements'

// PartiQL (DynamoDB) completion data — pure, no vscode. The host maps these to
// vscode.CompletionItems and supplies tables/attributes from the live adapter.
export interface PartiqlItem {
  label: string
  insertText: string
  kind: 'keyword' | 'function' | 'table' | 'attribute'
  detail?: string
}

// own-words: PartiQL is AWS's SQL dialect for DynamoDB; these are its statement
// and clause keywords, uppercased to read as reserved words
export const PARTIQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'BETWEEN', 'IN', 'IS',
  'MISSING', 'NULL', 'INSERT', 'INTO', 'VALUE', 'UPDATE', 'SET', 'REMOVE',
  'DELETE', 'RETURNING',
]

export const PARTIQL_FUNCTIONS = [
  'begins_with', 'contains', 'attribute_exists', 'attribute_not_exists', 'size',
]

export function buildPartiqlItems(
  prefix: string,
  tables: SchemaItem[],
  attrs: SchemaItem[],
): PartiqlItem[] {
  const p = prefix.toLowerCase()
  const starts = (s: string) => s.toLowerCase().startsWith(p)
  const items: PartiqlItem[] = []
  for (const k of PARTIQL_KEYWORDS) if (starts(k)) items.push({ label: k, insertText: k, kind: 'keyword' })
  for (const f of PARTIQL_FUNCTIONS) if (starts(f)) items.push({ label: f, insertText: f, kind: 'function' })
  for (const t of tables) {
    // PartiQL needs double quotes for many table names (dots, reserved words);
    // always quoting the insert is harmless and keeps this branch simple
    if (starts(t.name)) items.push({ label: t.name, insertText: `"${t.name}"`, kind: 'table' })
  }
  for (const a of attrs) {
    if (!starts(a.name)) continue
    const detail = [a.parent, a.detail].filter(Boolean).join(': ') || undefined
    items.push({ label: a.name, insertText: a.name, kind: 'attribute', ...(detail ? { detail } : {}) })
  }
  return items
}

// the identifier fragment being typed at the cursor (after any qualifying dot)
const wordPrefix = (textBeforeCursor: string) => /(\w*)$/.exec(textBeforeCursor)?.[1] ?? ''

const KINDS: Record<PartiqlItem['kind'], CompletionResult['kind']> =
  { keyword: 'keyword', function: 'function', table: 'table', attribute: 'column' }

export const dynamodbCompletion: CompletionContribution = {
  triggerCharacters: ['.', ' ', '"'],
  async provide(ctx: CompletionContext): Promise<CompletionResult[]> {
    // DynamoDB speaks PartiQL over the same 'sql' language files as postgres;
    // the host routes here by the file's connection adapter, not the language.
    if (!ctx.connected) return []
    const stmt = statementAt(ctx.fullText, ctx.offset, 'partiql')
    if (!stmt) return []
    const prefix = wordPrefix(ctx.fullText.slice(stmt.start, ctx.offset))
    const [tables, attrs] = await Promise.all([ctx.search('table', prefix), ctx.search('column', prefix)])
    return buildPartiqlItems(prefix, tables, attrs).map((pi): CompletionResult => ({
      label: pi.label, insertText: pi.insertText, kind: KINDS[pi.kind], ...(pi.detail ? { detail: pi.detail } : {}),
    }))
  },
}
