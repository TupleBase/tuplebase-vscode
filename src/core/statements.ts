import type { StatementSyntax } from '../adapters/types'

export interface StatementRange { text: string; start: number; end: number }

// dollarQuoting: postgres $tag$…$tag$ blocks. PartiQL (and other SQL dialects)
// have no dollar-quoting, so a bare `$` there is an ordinary character — leaving
// it on would let a `$…$` inside a value swallow a following `;` and mis-split.
export function splitStatements(text: string, dollarQuoting = true): StatementRange[] {
  const out: StatementRange[] = []
  let start = 0
  let i = 0
  const push = (end: number) => {
    const raw = text.slice(start, end)
    const trimmed = raw.trim()
    if (trimmed.length > 0 && hasSqlCode(trimmed)) {
      out.push({ text: trimmed, start: start + raw.search(/\S/), end })
    }
    start = end + 1
  }
  while (i < text.length) {
    const ch = text[i]
    if (ch === "'" || ch === '"') {
      i++
      while (i < text.length) {
        if (text[i] === ch && text[i + 1] === ch) { i += 2; continue }
        if (text[i] === ch) break
        i++
      }
    } else if (ch === '$' && dollarQuoting) {
      const tag = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(i))?.[0]
      if (tag) {
        const close = text.indexOf(tag, i + tag.length)
        i = close === -1 ? text.length : close + tag.length - 1
      }
    } else if (ch === '-' && text[i + 1] === '-') {
      while (i < text.length && text[i] !== '\n') i++
      continue
    } else if (ch === '/' && text[i + 1] === '*') {
      i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++
      i++
    } else if (ch === ';') {
      push(i)
    }
    i++
  }
  push(text.length)
  return out
}

function hasSqlCode(text: string): boolean {
  let index = 0
  while (index < text.length) {
    if (/\s/.test(text[index])) {
      index++
    } else if (text[index] === '-' && text[index + 1] === '-') {
      index = text.indexOf('\n', index + 2)
      if (index === -1) return false
    } else if (text[index] === '/' && text[index + 1] === '*') {
      const close = text.indexOf('*/', index + 2)
      if (close === -1) return false
      index = close + 2
    } else {
      return true
    }
  }
  return false
}

export function splitRedisCommands(text: string): StatementRange[] {
  const out: StatementRange[] = []
  let start = 0
  for (const line of text.split('\n')) {
    const end = start + line.length
    const trimmed = line.trim()
    if (trimmed.length > 0 && !trimmed.startsWith('#')) out.push({ text: trimmed, start, end })
    start = end + 1
  }
  return out
}

// Every runnable statement in the text, in order — SQL/PartiQL split on `;`,
// redis split per line. Used by "Run All Statements" to fan a file into tabs.
export function splitAll(text: string, syntax: StatementSyntax = 'sql'): StatementRange[] {
  return syntax === 'redis' ? splitRedisCommands(text) : splitStatements(text, syntax !== 'partiql')
}

export function statementAt(text: string, offset: number, syntax: StatementSyntax = 'sql'): StatementRange | undefined {
  if (syntax === 'redis') {
    // line-based: cursor on a comment/blank line means there is nothing to run
    return splitRedisCommands(text).find(s => offset >= s.start && offset <= s.end)
  }
  const all = splitStatements(text, syntax !== 'partiql')
  return all.find(s => offset >= s.start && offset <= s.end + 1) ?? all[all.length - 1]
}
