import { describe, expect, it } from 'vitest'
import { SecretVault, SecretBackend, KeyIndex } from './secrets'

function fakes() {
  const secrets = new Map<string, string>()
  const state = new Map<string, unknown>()
  const backend: SecretBackend = {
    get: async k => secrets.get(k),
    store: async (k, v) => void secrets.set(k, v),
    delete: async k => void secrets.delete(k),
  }
  const index: KeyIndex = {
    get: <T,>(k: string, d: T) => (state.has(k) ? (state.get(k) as T) : d),
    update: async (k, v) => void state.set(k, v),
  }
  return { backend, index, secrets }
}

describe('SecretVault', () => {
  it('builds namespaced keys', () => {
    expect(SecretVault.key('dev', 'orders-db', 'password')).toBe('rowboat.dev.orders-db.password')
  })

  it('stores, retrieves and indexes', async () => {
    const { backend, index } = fakes()
    const v = new SecretVault(backend, index)
    await v.store('dev', 'db', 'password', 'hunter2')
    expect(await v.get('dev', 'db', 'password')).toBe('hunter2')
  })

  it('deleteConnection removes all fields of that connection only', async () => {
    const { backend, index, secrets } = fakes()
    const v = new SecretVault(backend, index)
    await v.store('dev', 'db', 'password', 'a')
    await v.store('prod', 'db', 'password', 'b')
    await v.deleteConnection('dev', 'db')
    expect(secrets.has('rowboat.dev.db.password')).toBe(false)
    expect(secrets.has('rowboat.prod.db.password')).toBe(true)
  })

  it('clearAll deletes every indexed key and returns them', async () => {
    const { backend, index, secrets } = fakes()
    const v = new SecretVault(backend, index)
    await v.store('dev', 'db', 'password', 'a')
    await v.store('prod', 'db', 'password', 'b')
    const deleted = await v.clearAll()
    expect(deleted.sort()).toEqual(['rowboat.dev.db.password', 'rowboat.prod.db.password'])
    expect(secrets.size).toBe(0)
  })
})
