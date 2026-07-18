import { describe, expect, it } from 'vitest'
import { buildSslOptions, parsePgNodeId, pgNodeId, postgresFactory } from './adapter'

const readPem = () => 'PEM'

describe('pgNodeId / parsePgNodeId', () => {
  it('round-trips plain names', () => {
    expect(parsePgNodeId(pgNodeId('public', 'crew', 'name'))).toEqual(['public', 'crew', 'name'])
  })
  it('round-trips names containing dots', () => {
    expect(parsePgNodeId(pgNodeId('my.schema', 'my.table'))).toEqual(['my.schema', 'my.table'])
  })
  it('round-trips names containing percent signs', () => {
    expect(parsePgNodeId(pgNodeId('100%2Edone', 'a%b'))).toEqual(['100%2Edone', 'a%b'])
  })
  it('round-trips unicode names', () => {
    expect(parsePgNodeId(pgNodeId('schéma', '表.名'))).toEqual(['schéma', '表.名'])
  })
  it('is deterministic and keeps the pg: prefix', () => {
    expect(pgNodeId('public')).toBe('pg:public')
    expect(pgNodeId('my.schema', 't')).toBe(pgNodeId('my.schema', 't'))
  })
})

describe('buildSslOptions', () => {
  it('returns undefined when sslmode is absent', () => {
    expect(buildSslOptions({})).toBeUndefined()
  })
  it('returns undefined for disable', () => {
    expect(buildSslOptions({ sslmode: 'disable' })).toBeUndefined()
  })
  it('require encrypts without certificate checks', () => {
    expect(buildSslOptions({ sslmode: 'require' })).toEqual({ rejectUnauthorized: false })
  })
  it('verify-ca checks the CA but not the hostname', () => {
    const ssl = buildSslOptions({ sslmode: 'verify-ca', sslrootcert: '/certs/ca.pem' }, readPem)!
    expect(ssl.ca).toBe('PEM')
    expect(ssl.rejectUnauthorized).toBe(true)
    expect((ssl.checkServerIdentity as () => undefined)()).toBeUndefined()
  })
  it('verify-full keeps default hostname verification', () => {
    const ssl = buildSslOptions({ sslmode: 'verify-full', sslrootcert: '/certs/ca.pem' }, readPem)!
    expect(ssl).toEqual({ ca: 'PEM', rejectUnauthorized: true })
    expect(ssl.checkServerIdentity).toBeUndefined()
  })
  it('throws on unknown sslmode', () => {
    expect(() => buildSslOptions({ sslmode: 'prefer' })).toThrow(/unknown sslmode 'prefer'/)
  })
  it('throws when verify modes lack sslrootcert', () => {
    expect(() => buildSslOptions({ sslmode: 'verify-ca' })).toThrow(/requires sslrootcert/)
    expect(() => buildSslOptions({ sslmode: 'verify-full', sslrootcert: '' })).toThrow(/requires sslrootcert/)
  })
  it('rejects relative sslrootcert paths, pointing at ${env:VAR}', () => {
    expect(() => buildSslOptions({ sslmode: 'verify-full', sslrootcert: 'certs/ca.pem' }, readPem))
      .toThrow(/absolute path.*'certs\/ca\.pem'.*\$\{env:VAR\}/)
  })
  it('names the path when the CA file cannot be read', () => {
    const readFile = () => { throw new Error('ENOENT: no such file or directory') }
    expect(() => buildSslOptions({ sslmode: 'verify-ca', sslrootcert: '/missing/ca.pem' }, readFile))
      .toThrow(/cannot read sslrootcert '\/missing\/ca\.pem': ENOENT/)
  })
})

describe('postgresFactory.validate', () => {
  const base = { adapter: 'postgres', host: 'h', database: 'd', user: 'u' }

  it('keeps the existing required-field checks', () => {
    expect(postgresFactory.validate({ adapter: 'postgres' })).toEqual([
      'host is required', 'database is required', 'user is required',
    ])
  })
  it('accepts every valid sslmode', () => {
    for (const sslmode of ['disable', 'require']) {
      expect(postgresFactory.validate({ ...base, sslmode })).toEqual([])
    }
    for (const sslmode of ['verify-ca', 'verify-full']) {
      expect(postgresFactory.validate({ ...base, sslmode, sslrootcert: '/ca.pem' })).toEqual([])
    }
  })
  it('rejects an unknown sslmode', () => {
    expect(postgresFactory.validate({ ...base, sslmode: 'prefer' }))
      .toEqual(['sslmode must be one of disable, require, verify-ca, verify-full'])
  })
  it('requires sslrootcert for verify modes', () => {
    expect(postgresFactory.validate({ ...base, sslmode: 'verify-ca' }))
      .toEqual(['sslrootcert is required for sslmode=verify-ca'])
    expect(postgresFactory.validate({ ...base, sslmode: 'verify-full' }))
      .toEqual(['sslrootcert is required for sslmode=verify-full'])
  })
  it('rejects sslrootcert without a verify mode', () => {
    expect(postgresFactory.validate({ ...base, sslrootcert: '/ca.pem' }))
      .toEqual(['sslrootcert is only valid with sslmode verify-ca or verify-full'])
    expect(postgresFactory.validate({ ...base, sslmode: 'require', sslrootcert: '/ca.pem' }))
      .toEqual(['sslrootcert is only valid with sslmode verify-ca or verify-full'])
  })
})
