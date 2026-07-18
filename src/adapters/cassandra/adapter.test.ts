import { describe, expect, it } from 'vitest'
import { cassandraFactory, csNodeId, parseCsNodeId } from './adapter'

describe('cassandraFactory.validate', () => {
  it('requires host and datacenter', () => {
    expect(cassandraFactory.validate({ adapter: 'cassandra' })).toEqual([
      'host is required', 'datacenter is required',
    ])
  })

  it('passes a complete config', () => {
    expect(cassandraFactory.validate({ adapter: 'cassandra', host: 'h', datacenter: 'dc1' })).toEqual([])
  })

  it('prompts for a password only when auth is enabled', () => {
    const base = { group: 'g', name: 'n', adapter: 'cassandra', readonly: false }
    expect(cassandraFactory.requiredSecrets({ ...base })).toEqual([])
    expect(cassandraFactory.requiredSecrets({ ...base, auth: true })).toEqual(['password'])
  })
})

describe('csNodeId', () => {
  it('round-trips segments, preserving names that contain dots', () => {
    expect(parseCsNodeId(csNodeId('ks', 'events.v2', 'id'))).toEqual(['ks', 'events.v2', 'id'])
  })
})
