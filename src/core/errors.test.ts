import { describe, expect, it } from 'vitest'
import { errorMessage } from './errors'

describe('errorMessage', () => {
  it('returns the message of a plain Error', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom')
  })

  it('joins inner errors of an AggregateError (empty message on localhost ECONNREFUSED)', () => {
    const e = new AggregateError([
      new Error('connect ECONNREFUSED ::1:6379'),
      new Error('connect ECONNREFUSED 127.0.0.1:6379'),
    ])
    expect(errorMessage(e)).toBe('connect ECONNREFUSED ::1:6379; connect ECONNREFUSED 127.0.0.1:6379')
  })

  it('prefers the AggregateError message when it has one', () => {
    const e = new AggregateError([new Error('inner')], 'outer summary')
    expect(errorMessage(e)).toBe('outer summary')
  })

  it('stringifies non-Error throws', () => {
    expect(errorMessage('plain string')).toBe('plain string')
    expect(errorMessage(undefined)).toBe('undefined')
  })

  it('falls back for an Error with an empty message', () => {
    expect(errorMessage(new Error(''))).toBe('Error')
  })
})
