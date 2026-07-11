import { describe, expect, it } from 'vitest'
import { buildConnection, fieldsFor, validate } from './connFormSpec'

describe('fieldsFor', () => {
  it('returns postgres fields with required + defaults', () => {
    const f = fieldsFor('postgres')
    const byKey = Object.fromEntries(f.map(x => [x.key, x]))
    expect(byKey.host.required).toBe(true)
    expect(byKey.database.required).toBe(true)
    expect(byKey.user.required).toBe(true)
    expect(byKey.port).toMatchObject({ kind: 'number', default: 5432 })
    expect(byKey.sslmode.kind).toBe('select')
  })

  it('returns redis and dynamodb field sets, each ending with the shared read-only toggle', () => {
    expect(fieldsFor('redis').map(f => f.key)).toEqual(['host', 'port', 'db', 'tls', 'username', 'auth', 'readonly'])
    expect(fieldsFor('dynamodb').map(f => f.key)).toEqual(['region', 'profile', 'endpoint', 'readonly'])
  })

  it('returns [] for an unknown adapter', () => {
    expect(fieldsFor('oracle')).toEqual([])
  })
})

describe('validate', () => {
  it('requires a connection name', () => {
    expect(validate('postgres', '', { host: 'h', database: 'd', user: 'u' })).toContain('Connection name is required')
  })

  it('reserves the name "readonly"', () => {
    expect(validate('postgres', 'readonly', { host: 'h', database: 'd', user: 'u' })[0]).toMatch(/reserved/)
  })

  it('flags missing required fields by label', () => {
    const errs = validate('postgres', 'pg', { host: 'h' })
    expect(errs).toContain('Database is required')
    expect(errs).toContain('User is required')
  })

  it('passes a complete connection', () => {
    expect(validate('postgres', 'pg', { host: 'h', database: 'd', user: 'u' })).toEqual([])
    expect(validate('dynamodb', 'ddb', { region: 'eu-west-1' })).toEqual([])
  })
})

describe('buildConnection', () => {
  it('builds a minimal postgres connection, omitting blanks and coercing numbers', () => {
    expect(buildConnection('postgres', { host: 'localhost', port: '5432', database: 'app', user: 'me', sslrootcert: '' }))
      .toEqual({ adapter: 'postgres', host: 'localhost', port: 5432, database: 'app', user: 'me' })
  })

  it('keeps true checkboxes and drops false ones', () => {
    expect(buildConnection('redis', { host: 'h', port: 6379, db: 0, tls: true, auth: false }))
      .toEqual({ adapter: 'redis', host: 'h', port: 6379, db: 0, tls: true })
  })

  it('includes only provided dynamodb fields', () => {
    expect(buildConnection('dynamodb', { region: 'local', endpoint: 'http://localhost:8000', profile: '' }))
      .toEqual({ adapter: 'dynamodb', region: 'local', endpoint: 'http://localhost:8000' })
  })
})
