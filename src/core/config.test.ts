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

const VALID = `{
  // comment allowed
  "defaultEnvironment": "dev",
  "environments": {
    "dev": {
      "orders-db": { "adapter": "postgres", "host": "localhost", "port": 5432, "database": "rowboat", "user": "rowboat" }
    }
  }
}`

describe('parseConfig', () => {
  it('parses JSONC with comments', () => {
    const { config, errors } = parseConfig(VALID)
    expect(errors).toEqual([])
    expect(config?.environments.dev['orders-db'].adapter).toBe('postgres')
    expect(config?.environments.dev['orders-db'].env).toBe('dev')
    expect(config?.environments.dev['orders-db'].name).toBe('orders-db')
  })
  it('reads an environment-level readonly guardrail', () => {
    const { config, errors } = parseConfig('{"environments":{"prod":{"readonly":true,"c":{"adapter":"postgres"}}}}')
    expect(errors).toEqual([])
    expect(config?.readonlyEnvironments.prod).toBe(true)
    expect(config?.environments.prod.c.adapter).toBe('postgres')
  })
  it('rejects unknown adapter', () => {
    const { errors } = parseConfig('{"environments":{"dev":{"c":{"adapter":"oracle"}}}}')
    expect(errors[0].message).toMatch(/unknown adapter/i)
    expect(errors[0].path).toBe('environments.dev.c.adapter')
  })
  it('rejects password-like fields', () => {
    const { errors } = parseConfig('{"environments":{"dev":{"c":{"adapter":"postgres","password":"x"}}}}')
    expect(errors[0].message).toMatch(/secret/i)
  })
  it('strips secret field values from the returned config', () => {
    const { config, errors } = parseConfig('{"environments":{"dev":{"c":{"adapter":"postgres","password":"x"}}}}')
    expect(errors[0].message).toMatch(/secret/i)
    expect(config?.environments.dev.c).not.toHaveProperty('password')
  })
  it('reports JSON syntax errors', () => {
    const { errors } = parseConfig('{ nope ')
    expect(errors.length).toBeGreaterThan(0)
  })
  it('interpolates env vars in string values', () => {
    const { config } = parseConfig(
      '{"environments":{"dev":{"c":{"adapter":"postgres","host":"${env:PGHOST:-localhost}"}}}}'
    )
    expect(config?.environments.dev.c.host).toBe('localhost')
  })
  it('surfaces missing env var as ConfigError, not throw', () => {
    const { errors } = parseConfig('{"environments":{"dev":{"c":{"adapter":"postgres","host":"${env:NOPE}"}}}}')
    expect(errors[0].message).toMatch(/NOPE/)
  })
})
