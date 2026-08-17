import type { WriteRule } from '../adapters/types'
import { presentationOf } from '../adapters/registry'

// SQL-ish word tokens outside comments, strings, quoted identifiers and
// Postgres dollar-quoted bodies. Read-only classification is conservative, but
// words that are data rather than syntax must not become false write signals.
function statementWords(statement: string): string[] {
  const words: string[] = []
  let i = 0
  while (i < statement.length) {
    if (/\s/.test(statement[i])) { i++; continue }
    if (statement.startsWith('--', i)) {
      i = statement.indexOf('\n', i + 2)
      if (i < 0) break
      continue
    }
    if (statement.startsWith('/*', i)) {
      let depth = 1
      i += 2
      while (i < statement.length && depth > 0) {
        if (statement.startsWith('/*', i)) { depth++; i += 2 }
        else if (statement.startsWith('*/', i)) { depth--; i += 2 }
        else i++
      }
      continue
    }
    const dollar = statement.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)?.[0]
    if (dollar) {
      const end = statement.indexOf(dollar, i + dollar.length)
      i = end < 0 ? statement.length : end + dollar.length
      continue
    }
    const quote = statement[i]
    if (quote === "'" || quote === '"' || quote === '`') {
      i++
      while (i < statement.length) {
        if (statement[i] === '\\') { i += 2; continue }
        if (statement[i] !== quote) { i++; continue }
        if (statement[i + 1] === quote) { i += 2; continue }
        i++
        break
      }
      continue
    }
    if (quote === '[') {
      i++
      while (i < statement.length) {
        if (statement[i] !== ']') { i++; continue }
        if (statement[i + 1] === ']') { i += 2; continue }
        i++
        break
      }
      continue
    }
    const word = statement.slice(i).match(/^[A-Za-z_][A-Za-z0-9_$]*/)?.[0]
    if (word) {
      words.push(word.toUpperCase())
      i += word.length
      continue
    }
    if (statement[i] === ';') words.push(';')
    i++
  }
  return words
}

function firstKeyword(statement: string): string {
  return statementWords(statement).find(word => word !== ';') ?? ''
}

function sqlFamilyWrite(keywords: readonly string[], statement: string): boolean {
  const statements: string[][] = [[]]
  for (const word of statementWords(statement)) {
    if (word === ';') statements.push([])
    else statements.at(-1)!.push(word)
  }
  return statements.some(words => {
    const first = words[0]
    if (!first) return false
    if (keywords.includes(first)) return true
    // CTEs can contain DML before their final SELECT/UPDATE/etc.
    if (first === 'WITH') return words.slice(1).some(word => keywords.includes(word))
    // EXPLAIN ANALYZE SELECT executes a read and is allowed; wrapped writes are
    // still rejected. Standalone ANALYZE is caught by the first-word check.
    if (first === 'EXPLAIN') {
      return words.slice(1).some(word => word !== 'ANALYZE' && keywords.includes(word))
    }
    // PostgreSQL SELECT INTO creates a table; MySQL can write an OUTFILE here.
    return first === 'SELECT' && words.includes('INTO')
  })
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
    case 'firstKeywordIn': return sqlFamilyWrite(rule.keywords, statement)
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
