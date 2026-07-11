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
        "local": { "local-pg": { "adapter": "postgres", "host": "localhost", "user": "rowboat" } },
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

  it('rejects unknown adapter', () => {
    const { errors } = parseConfig(base({ dev: { c: { adapter: 'oracle' } } }))
    expect(errors[0].message).toMatch(/unknown adapter/i)
    expect(errors[0].path).toBe('groups.dev.c.adapter')
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
