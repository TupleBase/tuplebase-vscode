// Formats one result row as a pretty JSON object keyed by column name, for the
// detail side view. Non-tabular values (dynamo nested items, redis blobs, json
// columns) render as nested JSON rather than the grid's flattened string.
export function formatRow(columns: { name: string }[], row: unknown[]): string {
  const obj: Record<string, unknown> = {}
  columns.forEach((col, i) => {
    const v = row[i]
    obj[col.name] = v === undefined ? null : v
  })
  return JSON.stringify(obj, (_key, value) => (typeof value === 'bigint' ? value.toString() : value), 2)
}
