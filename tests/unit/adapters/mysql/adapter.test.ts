import { describe, expect, it } from 'vitest'
import { buildMysqlSslOptions, mysqlFactory, myNodeId, parseMyNodeId } from '../../../../src/adapters/mysql/adapter'

const readPem = () => 'PEM'

describe('buildMysqlSslOptions', () => {
  it('disables TLS by default', () => {
    expect(buildMysqlSslOptions({})).toBeUndefined()
  })

  it('supports encrypted and verified modes', () => {
    expect(buildMysqlSslOptions({ sslmode: 'require' })).toEqual({ rejectUnauthorized: false })
    expect(buildMysqlSslOptions({ sslmode: 'verify-ca', sslrootcert: '/ca.pem' }, readPem))
      .toEqual({ ca: 'PEM', rejectUnauthorized: true, verifyIdentity: false })
    expect(buildMysqlSslOptions({ sslmode: 'verify-full', sslrootcert: '/ca.pem' }, readPem))
      .toEqual({ ca: 'PEM', rejectUnauthorized: true, verifyIdentity: true })
  })

  it('rejects invalid modes and CA paths', () => {
    expect(() => buildMysqlSslOptions({ sslmode: 'prefer' })).toThrow(/unknown sslmode/)
    expect(() => buildMysqlSslOptions({ sslmode: 'verify-full' })).toThrow(/requires sslrootcert/)
    expect(() => buildMysqlSslOptions({ sslmode: 'verify-full', sslrootcert: 'ca.pem' }, readPem))
      .toThrow(/absolute path/)
    expect(() => buildMysqlSslOptions(
      { sslmode: 'verify-full', sslrootcert: '/missing.pem' },
      () => { throw new Error('ENOENT') },
    )).toThrow(/cannot read sslrootcert.*ENOENT/)
  })
})

describe('mysqlFactory.validate', () => {
  it('requires host, database and user', () => {
    expect(mysqlFactory.validate({ adapter: 'mysql' })).toEqual([
      'host is required', 'database is required', 'user is required',
    ])
  })

  it('passes a complete config', () => {
    expect(mysqlFactory.validate({ adapter: 'mysql', host: 'h', database: 'd', user: 'u' })).toEqual([])
  })

  it('keeps TLS validation local to the mysql factory', () => {
    const base = { adapter: 'mysql', host: 'h', database: 'd', user: 'u' }
    expect(mysqlFactory.validate({ ...base, sslmode: 'verify-full' }))
      .toEqual(['sslrootcert is required for sslmode=verify-full'])
    expect(mysqlFactory.validate({ ...base, sslmode: 'verify-full', sslrootcert: '/ca.pem' })).toEqual([])
    expect(mysqlFactory.validate({ ...base, sslrootcert: '/ca.pem' }))
      .toEqual(['sslrootcert is only valid with sslmode verify-ca or verify-full'])
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
