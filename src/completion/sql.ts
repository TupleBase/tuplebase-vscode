import * as vscode from 'vscode'
import { ConnectionManager } from '../core/connections'
import { ConfigStore } from '../core/configStore'
import { getFileConnection } from '../core/fileConn'
import { statementAt } from '../core/statements'
import type { ItemKind, SchemaItem } from '../adapters/types'
import { buildPartiqlItems, type PartiqlItem } from './partiql'

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

function tableItem(i: SchemaItem): vscode.CompletionItem {
  const item = new vscode.CompletionItem(i.name, vscode.CompletionItemKind.Struct)
  item.insertText = i.name
  if (i.parent) item.detail = i.parent
  return item
}

function columnItem(name: string, detail: string | undefined): vscode.CompletionItem {
  const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Field)
  item.insertText = name
  if (detail) item.detail = detail
  return item
}

function keywordItem(label: string): vscode.CompletionItem {
  const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Keyword)
  item.insertText = label
  return item
}

function functionItem(name: string): vscode.CompletionItem {
  const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Function)
  item.insertText = name
  return item
}

function partiqlToItem(pi: PartiqlItem): vscode.CompletionItem {
  const kind = {
    keyword: vscode.CompletionItemKind.Keyword,
    function: vscode.CompletionItemKind.Function,
    table: vscode.CompletionItemKind.Struct,
    attribute: vscode.CompletionItemKind.Field,
  }[pi.kind]
  const item = new vscode.CompletionItem(pi.label, kind)
  item.insertText = pi.insertText
  if (pi.detail) item.detail = pi.detail
  return item
}

export function registerSqlCompletion(
  manager: ConnectionManager,
  store: ConfigStore,
  workspaceState: vscode.Memento,
): vscode.Disposable {
  const provider: vscode.CompletionItemProvider = {
    async provideCompletionItems(doc, position) {
      // live adapters only — never connect, never prompt (mirrors redis)
      const connName = getFileConnection(workspaceState, doc.uri.fsPath)
      if (!connName) return []
      const cfg = store.connections(manager.activeEnvironment ?? '').find(c => c.name === connName)
      if (!cfg || manager.factories.get(cfg.adapter)?.languageId !== 'sql') return []
      const adapter = manager.liveAdapter(connName)
      if (!adapter) return []

      const fullText = doc.getText()
      const offset = doc.offsetAt(position)
      const stmt = statementAt(fullText, offset, 'sql')
      if (!stmt) return []
      const textBeforeCursor = fullText.slice(stmt.start, offset)
      const prefix = wordPrefix(textBeforeCursor)
      // ponytail: searchItems hits the live server per completion (pg queries
      // information_schema, dynamo lists/describes; both capped) — add a
      // short-TTL cache keyed by (conn, kind, prefix) if it ever lags
      const search = async (kind: ItemKind): Promise<SchemaItem[]> => {
        try { return await adapter.searchItems(kind, prefix) } catch { return [] }
      }

      // dynamodb speaks PartiQL, not heuristic SQL
      if (cfg.adapter === 'dynamodb') {
        const [tables, attrs] = await Promise.all([search('table'), search('column')])
        return buildPartiqlItems(prefix, tables, attrs).map(partiqlToItem)
      }

      const ctx = sqlContext(textBeforeCursor)
      if (ctx === 'table') {
        return (await search('table')).map(tableItem)
      }
      if (typeof ctx === 'object') {
        const table = resolveAlias(stmt.text, ctx.alias)
        if (!table) return []
        return (await search('column')).filter(c => c.parent === table).map(c => columnItem(c.name, c.detail))
      }
      // column position: live columns first, then static keywords and functions
      const cols = (await search('column')).map(c => columnItem(c.name, colDetail(c)))
      return [...cols, ...SQL_KEYWORDS.map(keywordItem), ...SQL_FUNCTIONS.map(functionItem)]
    },
  }
  return vscode.languages.registerCompletionItemProvider('sql', provider, '.', ' ', '"')
}
