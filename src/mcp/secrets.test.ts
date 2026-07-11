import { describe, expect, it } from 'vitest'
import { envSecretSource, secretEnvVar } from './secrets'

describe('secretEnvVar', () => {
  it('uppercases and collapses non-alphanumerics', () => {
    expect(secretEnvVar('orders-pg', 'password')).toBe('ROWBOAT_SECRET_ORDERS_PG_PASSWORD')
    expect(secretEnvVar('cache', 'ssh:passphrase')).toBe('ROWBOAT_SECRET_CACHE_SSH_PASSPHRASE')
  })
})

describe('envSecretSource', () => {
  it('reads the value from the matching env var', () => {
    const src = envSecretSource({ ROWBOAT_SECRET_ORDERS_PG_PASSWORD: 'hunter2' })
    expect(src.get('orders-pg', 'password')).toBe('hunter2')
    expect(src.get('orders-pg', 'missing')).toBeUndefined()
  })
})
