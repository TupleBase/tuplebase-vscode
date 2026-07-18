import { describe, expect, it } from 'vitest'
import { mssqlFactory, msNodeId, parseMsNodeId } from './adapter'

describe('mssqlFactory.validate', () => {
  it('requires host, database and user', () => {
    expect(mssqlFactory.validate({ adapter: 'mssql' })).toEqual([
      'host is required', 'database is required', 'user is required',
    ])
  })

  it('passes a complete config', () => {
    expect(mssqlFactory.validate({ adapter: 'mssql', host: 'h', database: 'd', user: 'u' })).toEqual([])
  })

  it('always needs a password secret', () => {
    expect(mssqlFactory.requiredSecrets({ group: 'g', name: 'n', adapter: 'mssql', readonly: false })).toEqual(['password'])
  })
})

describe('msNodeId', () => {
  it('round-trips segments, preserving names that contain dots', () => {
    expect(parseMsNodeId(msNodeId('dbo', 'orders.v2', 'id'))).toEqual(['dbo', 'orders.v2', 'id'])
  })
})
