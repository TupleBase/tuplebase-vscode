import { describe, expect, it } from 'vitest'
import { mysqlFactory, myNodeId, parseMyNodeId } from './adapter'

describe('mysqlFactory.validate', () => {
  it('requires host, database and user', () => {
    expect(mysqlFactory.validate({ adapter: 'mysql' })).toEqual([
      'host is required', 'database is required', 'user is required',
    ])
  })

  it('passes a complete config', () => {
    expect(mysqlFactory.validate({ adapter: 'mysql', host: 'h', database: 'd', user: 'u' })).toEqual([])
  })

  it('always needs a password secret', () => {
    expect(mysqlFactory.requiredSecrets({ group: 'g', name: 'n', adapter: 'mysql', readonly: false })).toEqual(['password'])
  })
})

describe('myNodeId', () => {
  it('round-trips segments, preserving names that contain dots', () => {
    expect(parseMyNodeId(myNodeId('app', 'orders.v2', 'id'))).toEqual(['app', 'orders.v2', 'id'])
  })
})
