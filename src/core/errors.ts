// Node's net.connect on `localhost` tries ::1 and 127.0.0.1 and throws an
// AggregateError whose own message is "" — the detail lives in .errors.
export function errorMessage(e: unknown): string {
  if (e instanceof AggregateError && !e.message) {
    const inner = e.errors.map(errorMessage).filter(Boolean)
    if (inner.length) return inner.join('; ')
  }
  if (e instanceof Error) return e.message || e.name
  return String(e)
}
