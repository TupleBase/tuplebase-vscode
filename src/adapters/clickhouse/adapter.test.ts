import { describe, expect, it } from 'vitest'
import { clickhouseFactory, chNodeId, parseChNodeId } from './adapter'

describe('clickhouseFactory.validate', () => {
  it('requires host, database and user', () => {
    expect(clickhouseFactory.validate({ adapter: 'clickhouse' })).toEqual([
      'host is required', 'database is required', 'user is required',
    ])
  })

  it('passes a complete config', () => {
    expect(clickhouseFactory.validate({ adapter: 'clickhouse', host: 'h', database: 'd', user: 'u' })).toEqual([])
  })

  it('prompts for a password only when auth is enabled', () => {
    const base = { group: 'g', name: 'n', adapter: 'clickhouse', readonly: false }
    expect(clickhouseFactory.requiredSecrets({ ...base })).toEqual([])
    expect(clickhouseFactory.requiredSecrets({ ...base, auth: true })).toEqual(['password'])
  })
})

describe('chNodeId', () => {
  it('round-trips segments, preserving names that contain dots', () => {
    expect(parseChNodeId(chNodeId('db', 'events.v2', 'id'))).toEqual(['db', 'events.v2', 'id'])
  })
})
