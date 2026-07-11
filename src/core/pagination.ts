export interface WindowedQuery {
  sql: string
  offset: number
  paginated: boolean
}

// Only rewrite forward-only read statements we can safely bound.
const READ_START = /^\s*(select|with|table|values)\b/i
// Leave alone if the user already limits/offsets, or locks/streams rows.
const HANDS_OFF = /\b(limit|offset|for\s+update|for\s+share|for\s+no\s+key)\b/i

// Push a bounded window into a SELECT instead of fetching everything and slicing:
// append `LIMIT pageSize+1 OFFSET n`. The +1 sentinel proves a next page exists
// without a count(*). Returns paginated:false (run as-is) for writes, statements
// that already limit/lock, or anything not clearly a read.
export function windowedSql(stmt: string, pageSize: number, offset: number): WindowedQuery {
  const s = stmt.trim().replace(/;+\s*$/, '')
  if (!READ_START.test(s) || HANDS_OFF.test(s)) return { sql: stmt, offset: 0, paginated: false }
  return { sql: `${s} limit ${pageSize + 1} offset ${offset}`, offset, paginated: true }
}

// The offset to resume from, from an opaque page token (undefined → start).
export function offsetFromToken(token: string | undefined): number {
  const n = Number(token)
  return Number.isInteger(n) && n >= 0 ? n : 0
}
