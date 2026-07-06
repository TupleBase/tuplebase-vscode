export interface StatementRange { text: string; start: number; end: number }

export function splitStatements(text: string): StatementRange[] {
  const out: StatementRange[] = []
  let start = 0
  let i = 0
  const push = (end: number) => {
    const raw = text.slice(start, end)
    if (raw.trim().length > 0) out.push({ text: raw.trim(), start, end })
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
    } else if (ch === '$') {
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

export function statementAt(text: string, offset: number): StatementRange | undefined {
  const all = splitStatements(text)
  return all.find(s => offset >= s.start && offset <= s.end + 1) ?? all[all.length - 1]
}
