export const DEFAULT_QUERY_TIMEOUT_MS = 30_000

export function queryTimeoutMs(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : DEFAULT_QUERY_TIMEOUT_MS
}
