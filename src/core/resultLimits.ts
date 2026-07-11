export const DEFAULT_PAGE_SIZE = 500
export const DEFAULT_MAX_ROWS = 5000

const positiveInt = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback

// Rows fetched per run: the configured page size, never above the max-rows ceiling.
export function resolvePageSize(pageSize: unknown, maxRows: unknown): number {
  return Math.min(positiveInt(pageSize, DEFAULT_PAGE_SIZE), positiveInt(maxRows, DEFAULT_MAX_ROWS))
}
