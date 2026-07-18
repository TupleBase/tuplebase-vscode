import type { WriteRule } from '../adapters/types'
import { presentationOf } from '../adapters/registry'

// leading token of a statement, upper-cased, skipping leading SQL comments
function firstKeyword(statement: string): string {
  return statement.replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/, '').match(/^\w+/)?.[0]?.toUpperCase() ?? ''
}

// the `.method(` name in a `db.collection.method(...)` command, lower-cased
function methodToken(statement: string): string {
  return /\.\s*(\w+)\s*\(/.exec(statement)?.[1]?.toLowerCase() ?? ''
}

// Apply an adapter's declared write rule to a statement. No rule → conservative
// (treat as a write, so a read-only connection errs on the side of blocking).
export function classifyWrite(rule: WriteRule | undefined, statement: string): boolean {
  if (!rule) return true
  switch (rule.mode) {
    case 'firstKeywordIn': return rule.keywords.includes(firstKeyword(statement))
    case 'firstKeywordNotIn': return !rule.keywords.includes(firstKeyword(statement))
    case 'anyKeyword': return new RegExp(`\\b(${rule.keywords.join('|')})\\b`, 'i').test(statement)
    case 'methodNotIn': return !rule.keywords.includes(methodToken(statement))
  }
}

// Does this statement modify data? Dispatches to the adapter's own writeRule
// (declared in its presentation) — core stays generic, engines own their rules.
export function isWriteStatement(adapter: string, statement: string): boolean {
  return classifyWrite(presentationOf(adapter)?.writeRule, statement)
}
