import * as fs from 'node:fs'
import * as path from 'node:path'

export interface HistoryEntry {
  ts: number
  env: string
  conn: string
  adapter: string
  languageId: string
  statement: string
  ok: boolean
  elapsedMs: number
  rowCount?: number
}

const MAX_ENTRIES = 1000
const KEEP_ENTRIES = 500

function redact(statement: string): string {
  const first = statement.trimStart().split(/\s+/, 1)[0]?.toUpperCase()
  if (first === 'AUTH') return 'AUTH ***'
  if (first === 'HELLO') {
    const auth = /\bAUTH\b/i.exec(statement)
    if (auth) return statement.slice(0, auth.index + auth[0].length) + ' ***'
  }
  return statement
}

export class HistoryStore {
  private file: string

  constructor(dir: string) {
    this.file = path.join(dir, 'history.jsonl')
    fs.mkdirSync(dir, { recursive: true })
  }

  append(entry: HistoryEntry) {
    const line = JSON.stringify({ ...entry, statement: redact(entry.statement) })
    fs.appendFileSync(this.file, line + '\n')
    this.prune()
  }

  list(limit = 50): HistoryEntry[] {
    return this.readAll().slice(-limit).reverse()
  }

  clear() {
    fs.rmSync(this.file, { force: true })
  }

  private readAll(): HistoryEntry[] {
    let raw: string
    try {
      raw = fs.readFileSync(this.file, 'utf8')
    } catch {
      return []
    }
    const entries: HistoryEntry[] = []
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue
      try {
        const parsed = JSON.parse(line)
        if (parsed && typeof parsed.statement === 'string') entries.push(parsed)
      } catch {
        // corrupt line — skip it, history is best-effort
      }
    }
    return entries
  }

  // ponytail: re-reads the whole file on every append and rewrites it wholesale
  // when over 1000 entries; fine for ~1000 tiny lines, keep an in-memory count
  // and stream-rewrite if history ever grows beyond that.
  private prune() {
    const entries = this.readAll()
    if (entries.length <= MAX_ENTRIES) return
    const kept = entries.slice(-KEEP_ENTRIES)
    fs.writeFileSync(this.file, kept.map(e => JSON.stringify(e)).join('\n') + '\n')
  }
}
