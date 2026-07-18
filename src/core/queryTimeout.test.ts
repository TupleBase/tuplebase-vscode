import { describe, expect, it } from 'vitest'
import { DEFAULT_QUERY_TIMEOUT_MS, queryTimeoutMs } from './queryTimeout'

describe('queryTimeoutMs', () => {
  it('uses the default for absent or invalid values', () => {
    expect(queryTimeoutMs(undefined)).toBe(DEFAULT_QUERY_TIMEOUT_MS)
    expect(queryTimeoutMs(0)).toBe(DEFAULT_QUERY_TIMEOUT_MS)
    expect(queryTimeoutMs(-1)).toBe(DEFAULT_QUERY_TIMEOUT_MS)
  })

  it('accepts positive configured millisecond values', () => {
    expect(queryTimeoutMs(1250.8)).toBe(1250)
  })
})
