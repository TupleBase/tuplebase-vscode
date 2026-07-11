// Formats one result row as a pretty JSON object keyed by column name, for the
// detail side view. Non-tabular values (dynamo nested items, redis blobs, json
// columns) render as nested JSON rather than the grid's flattened string.
export function formatRow(columns: { name: string }[], row: unknown[]): string {
  return JSON.stringify(rowObject(columns, row), (_key, value) => (typeof value === 'bigint' ? value.toString() : value), 2)
}

function rowObject(columns: { name: string }[], row: unknown[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {}
  columns.forEach((col, i) => { obj[col.name] = row[i] === undefined ? null : row[i] })
  return obj
}

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

// Syntax-highlighted, collapsible HTML for the detail view. Objects/arrays use
// native <details> so collapsing needs no script; token spans are coloured from
// the editor theme (see results.css). Pure string output — unit-tested directly.
export function rowToHtml(columns: { name: string }[], row: unknown[]): string {
  return renderValue(rowObject(columns, row))
}

function renderValue(v: unknown): string {
  if (v === null || v === undefined) return '<span class="jx-null">null</span>'
  const t = typeof v
  if (t === 'string') return `<span class="jx-str">"${esc(v as string)}"</span>`
  if (t === 'number' || t === 'bigint') return `<span class="jx-num">${esc(String(v))}</span>`
  if (t === 'boolean') return `<span class="jx-bool">${v}</span>`
  if (Array.isArray(v)) return renderNode('[', ']', v.map(renderValue))
  if (t === 'object') {
    const o = v as Record<string, unknown>
    return renderNode('{', '}', Object.keys(o).map(k =>
      `<span class="jx-key">"${esc(k)}"</span><span class="jx-punc">: </span>${renderValue(o[k])}`))
  }
  return `<span class="jx-str">"${esc(String(v))}"</span>`
}

function renderNode(open: string, close: string, parts: string[]): string {
  if (parts.length === 0) return `<span class="jx-punc">${open}${close}</span>`
  const rows = parts
    .map((p, i) => `<div class="jx-row">${p}${i < parts.length - 1 ? '<span class="jx-punc">,</span>' : ''}</div>`)
    .join('')
  return `<details open class="jx-node"><summary><span class="jx-punc">${open}</span>`
    + `<span class="jx-meta">${parts.length}</span></summary>`
    + `<div class="jx-body">${rows}</div><span class="jx-punc">${close}</span></details>`
}
