import { describe, expect, it } from 'vitest'
import { interpolate, parseConfig } from './config'

describe('interpolate', () => {
  it('substitutes ${env:VAR}', () => {
    expect(interpolate('host-${env:FOO}', { FOO: 'x' })).toBe('host-x')
  })
  it('uses default with ${env:VAR:-fallback}', () => {
    expect(interpolate('${env:MISSING:-def}', {})).toBe('def')
  })
  it('throws on missing var without default', () => {
    expect(() => interpolate('${env:MISSING}', {})).toThrow(/MISSING/)
  })
  it('leaves plain strings alone', () => {
    expect(interpolate('localhost', {})).toBe('localhost')
  })
})

const base = (groups: unknown, version: unknown = 1) => JSON.stringify({ version, groups })

describe('parseConfig (groups model)', () => {
  it('parses JSONC with comments into a flat connection map with group tags', () => {
    const text = `{
      // comment allowed
      "version": 1,
      "groups": {
        "local": { "local-pg": { "adapter": "postgres", "host": "localhost", "user": "tuplebase" } },
        "prod":  { "orders-pg": { "adapter": "postgres", "host": "p" } }
      }
    }`
    const { config, errors } = parseConfig(text)
    expect(errors).toEqual([])
    expect(config!.version).toBe(1)
    expect(config!.groups).toEqual(['local', 'prod'])
    expect(config!.connections['local-pg']).toMatchObject({ name: 'local-pg', group: 'local', adapter: 'postgres', host: 'localhost', readonly: false })
    expect(config!.connections['orders-pg'].group).toBe('prod')
  })

  it('requires version === 1', () => {
    expect(parseConfig('{"groups":{"local":{}}}').errors[0].message).toMatch(/version/)
    expect(parseConfig(base({ local: {} }, 2)).errors[0].message).toMatch(/version/)
    expect(parseConfig(base({ local: {} }, 1)).errors).toEqual([])
  })

  it('resolves readonly: connection override ?? group default ?? false', () => {
    const { config } = parseConfig(base({
      prod: { readonly: true, a: { adapter: 'postgres' }, b: { adapter: 'postgres', readonly: false } },
      dev: { c: { adapter: 'postgres' } },
    }))
    expect(config!.connections['a'].readonly).toBe(true)
    expect(config!.connections['b'].readonly).toBe(false)
    expect(config!.connections['c'].readonly).toBe(false)
  })

  it('does not leak the group-level readonly key as a connection', () => {
    const { config } = parseConfig(base({ prod: { readonly: true, a: { adapter: 'postgres' } } }))
    expect(config!.connections).not.toHaveProperty('readonly')
    expect(Object.keys(config!.connections)).toEqual(['a'])
  })

  it('flags a duplicate connection name across groups and keeps the first', () => {
    const { config, errors } = parseConfig(base({
      g1: { dup: { adapter: 'postgres', host: 'first' } },
      g2: { dup: { adapter: 'redis', host: 'second' } },
    }))
    expect(errors.some(e => /duplicate connection name "dup"/i.test(e.message))).toBe(true)
    expect(config!.connections['dup'].group).toBe('g1')
    expect(config!.connections['dup'].host).toBe('first')
  })

  it('skips connections whose adapter is unknown or not enabled, without errors', () => {
    const { config, errors } = parseConfig(base({ dev: {
      c: { adapter: 'oracle' },
      d: { adapter: 'redis', host: 'localhost' },
      e: { adapter: 'postgres', host: 'h' },
      f: {},
      g: { adapter: 123 },
    } }))
    expect(errors).toEqual([])
    expect(Object.keys(config!.connections)).toEqual(['e'])
  })

  it('rejects and strips password-like fields', () => {
    const { config, errors } = parseConfig(base({ dev: { c: { adapter: 'postgres', password: 'x' } } }))
    expect(errors[0].message).toMatch(/secret/i)
    expect(config!.connections['c']).not.toHaveProperty('password')
  })

  it('reports JSON syntax errors', () => {
    expect(parseConfig('{ nope ').errors.length).toBeGreaterThan(0)
  })

  it('interpolates ${env:VAR} and surfaces a missing var as an error, not a throw', () => {
    const ok = parseConfig(base({ g: { c: { adapter: 'postgres', host: '${env:PGHOST:-localhost}' } } }))
    expect(ok.config!.connections['c'].host).toBe('localhost')
    const missing = parseConfig(base({ g: { c: { adapter: 'postgres', host: '${env:NOPE}' } } }))
    expect(missing.errors[0].message).toMatch(/NOPE/)
  })

  it('errors when groups is missing', () => {
    expect(parseConfig(JSON.stringify({ version: 1 })).errors[0].message).toMatch(/groups/)
  })
})

describe('parseConfig ssh tunnels', () => {
  const withSsh = (adapter: string, ssh: unknown, extra: Record<string, unknown> = {}) =>
    base({ prod: { c: { adapter, ...extra, ssh } } })

  it('parses a full ssh block and interpolates its string fields', () => {
    const text = withSsh('postgres', { host: '${env:BASTION}', port: 2222, user: 'ec2-user', privateKey: '~/.ssh/id_ed25519' }, { host: 'db.internal', user: 'app' })
    const { config, errors } = parseConfig(text, { BASTION: 'bastion.example.com' })
    expect(errors).toEqual([])
    expect(config!.connections['c'].ssh).toEqual({
      host: 'bastion.example.com', port: 2222, user: 'ec2-user', privateKey: '~/.ssh/id_ed25519',
    })
  })

  it('allows password auth without a private key', () => {
    const { config, errors } = parseConfig(withSsh('postgres', { host: 'b', user: 'u', password: true }, { host: 'r' }))
    expect(errors).toEqual([])
    expect(config!.connections['c'].ssh).toEqual({ host: 'b', user: 'u', password: true })
  })

  it('skips a not-enabled adapter before ssh validation (dynamodb)', () => {
    const { config, errors } = parseConfig(withSsh('dynamodb', { host: 'b', user: 'u', privateKey: 'k' }, { region: 'eu-west-1' }))
    expect(errors).toEqual([])
    expect(config!.connections['c']).toBeUndefined()
  })

  it('requires host and user', () => {
    const { errors } = parseConfig(withSsh('postgres', { privateKey: 'k' }, { host: 'db', user: 'app' }))
    expect(errors.map(e => e.message)).toEqual(expect.arrayContaining([
      expect.stringMatching(/ssh\.host is required/),
      expect.stringMatching(/ssh\.user is required/),
    ]))
  })

  it('rejects a secret string where a boolean flag is expected', () => {
    const { errors } = parseConfig(withSsh('postgres', { host: 'b', user: 'u', password: 'hunter2' }, { host: 'db', user: 'app' }))
    expect(errors.some(e => /ssh\.password must be true\/false/.test(e.message))).toBe(true)
  })

  it('needs at least one auth method', () => {
    const { errors } = parseConfig(withSsh('postgres', { host: 'b', user: 'u' }, { host: 'db', user: 'app' }))
    expect(errors.some(e => /privateKey path or "password": true/.test(e.message))).toBe(true)
  })

  it('flags unknown ssh fields', () => {
    const { errors } = parseConfig(withSsh('postgres', { host: 'b', user: 'u', privateKey: 'k', proxyJump: 'x' }, { host: 'db', user: 'app' }))
    expect(errors.some(e => /unknown ssh field "proxyJump"/.test(e.message))).toBe(true)
  })
})

describe('parseConfig promptPassword', () => {
  it('carries a boolean promptPassword flag onto the connection', () => {
    const { config, errors } = parseConfig(base({ g: { c: { adapter: 'postgres', host: 'h', user: 'u', promptPassword: true } } }))
    expect(errors).toEqual([])
    expect(config!.connections['c'].promptPassword).toBe(true)
  })

  it('rejects a non-boolean promptPassword', () => {
    const { errors } = parseConfig(base({ g: { c: { adapter: 'postgres', host: 'h', user: 'u', promptPassword: 'yes' } } }))
    expect(errors.some(e => /promptPassword must be a boolean/.test(e.message))).toBe(true)
  })
})
