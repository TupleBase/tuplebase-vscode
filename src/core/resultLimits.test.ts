import { describe, expect, it } from 'vitest'
import { DEFAULT_MAX_ROWS, DEFAULT_PAGE_SIZE, resolvePageSize } from './resultLimits'

const fallback = Math.min(DEFAULT_PAGE_SIZE, DEFAULT_MAX_ROWS)

describe('resolvePageSize', () => {
  it('uses the configured page size when valid', () => {
    expect(resolvePageSize(200, 5000)).toBe(200)
  })
  it('clamps the page size to maxRows', () => {
    expect(resolvePageSize(10000, 1000)).toBe(1000)
  })
  it('falls back to defaults on invalid input', () => {
    expect(resolvePageSize(0, -1)).toBe(fallback)
    expect(resolvePageSize('x', undefined)).toBe(fallback)
  })
  it('floors fractional values', () => {
    expect(resolvePageSize(150.9, 5000)).toBe(150)
  })
})
