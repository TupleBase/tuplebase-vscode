import { describe, expect, it } from 'vitest'
import { buildConnection, validate, withReadonly } from './connFormSpec'
import { adapterById } from '../adapters/registry'

// form fields as the host assembles them: adapter descriptor fields + read-only
const fieldsFor = (id: string) => withReadonly(adapterById.get(id)?.presentation.fields ?? [])

describe('adapter form fields', () => {
  it('returns postgres fields with required + defaults', () => {
    const byKey = Object.fromEntries(fieldsFor('postgres').map(x => [x.key, x]))
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

  it('returns just the read-only toggle for an unknown adapter', () => {
    expect(fieldsFor('oracle').map(f => f.key)).toEqual(['readonly'])
  })
})

describe('validate', () => {
  it('requires a connection name', () => {
    expect(validate(fieldsFor('postgres'), '', { host: 'h', database: 'd', user: 'u' }))
      .toContain('Connection name is required')
  })

  it('reserves the name "readonly"', () => {
    expect(validate(fieldsFor('postgres'), 'readonly', { host: 'h', database: 'd', user: 'u' })[0]).toMatch(/reserved/)
  })

  it('flags missing required fields by label', () => {
    const errs = validate(fieldsFor('postgres'), 'pg', { host: 'h' })
    expect(errs).toContain('Database is required')
    expect(errs).toContain('User is required')
  })

  it('passes a complete connection', () => {
    expect(validate(fieldsFor('postgres'), 'pg', { host: 'h', database: 'd', user: 'u' })).toEqual([])
    expect(validate(fieldsFor('dynamodb'), 'ddb', { region: 'eu-west-1' })).toEqual([])
  })
})

describe('buildConnection', () => {
  it('builds a minimal postgres connection, omitting blanks and coercing numbers', () => {
    expect(buildConnection('postgres', fieldsFor('postgres'),
      { host: 'localhost', port: '5432', database: 'app', user: 'me', sslrootcert: '' }))
      .toEqual({ adapter: 'postgres', host: 'localhost', port: 5432, database: 'app', user: 'me' })
  })

  it('keeps true checkboxes and drops false ones', () => {
    expect(buildConnection('redis', fieldsFor('redis'), { host: 'h', port: 6379, db: 0, tls: true, auth: false }))
      .toEqual({ adapter: 'redis', host: 'h', port: 6379, db: 0, tls: true })
  })

  it('includes only provided dynamodb fields', () => {
    expect(buildConnection('dynamodb', fieldsFor('dynamodb'),
      { region: 'local', endpoint: 'http://localhost:8000', profile: '' }))
      .toEqual({ adapter: 'dynamodb', region: 'local', endpoint: 'http://localhost:8000' })
  })
})
