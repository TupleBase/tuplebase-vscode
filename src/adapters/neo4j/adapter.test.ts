import { describe, expect, it } from 'vitest'
import { neo4jFactory, njNodeId, parseNjNodeId } from './adapter'

describe('neo4jFactory.validate', () => {
  it('requires host and user', () => {
    expect(neo4jFactory.validate({ adapter: 'neo4j' })).toEqual(['host is required', 'user is required'])
  })

  it('passes a complete config', () => {
    expect(neo4jFactory.validate({ adapter: 'neo4j', host: 'h', user: 'neo4j' })).toEqual([])
  })

  it('always needs a password secret', () => {
    expect(neo4jFactory.requiredSecrets({ group: 'g', name: 'n', adapter: 'neo4j', readonly: false })).toEqual(['password'])
  })
})

describe('njNodeId', () => {
  it('round-trips segments, preserving names that contain dots', () => {
    expect(parseNjNodeId(njNodeId('Crew', 'home.port', 'id'))).toEqual(['Crew', 'home.port', 'id'])
  })
})
