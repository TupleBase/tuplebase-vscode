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
    update: async (k, v) => {
      await Promise.resolve() // ponytail: forces read-modify-write to interleave, exposing the lost-update race
      state.set(k, v)
    },
  }
  return { backend, index, secrets }
}

describe('SecretVault', () => {
  it('builds namespaced keys from connection name and field', () => {
    expect(SecretVault.key('orders-db', 'password')).toBe('tuplebase.orders-db.password')
  })

  it('stores and retrieves by connection name', async () => {
    const { backend, index } = fakes()
    const v = new SecretVault(backend, index)
    await v.store('db', 'password', 'hunter2')
    expect(await v.get('db', 'password')).toBe('hunter2')
  })

  it('deleteConnection removes all fields of that connection only', async () => {
    const { backend, index, secrets } = fakes()
    const v = new SecretVault(backend, index)
    await v.store('db', 'password', 'a')
    await v.store('db', 'user', 'admin')
    await v.store('other', 'password', 'b')
    await v.deleteConnection('db')
    expect(secrets.has('tuplebase.db.password')).toBe(false)
    expect(secrets.has('tuplebase.db.user')).toBe(false)
    expect(secrets.has('tuplebase.other.password')).toBe(true)
  })

  it('clearAll deletes every indexed key and returns them', async () => {
    const { backend, index, secrets } = fakes()
    const v = new SecretVault(backend, index)
    await v.store('db', 'password', 'a')
    await v.store('other', 'password', 'b')
    const deleted = await v.clearAll()
    expect(deleted.sort()).toEqual(['tuplebase.db.password', 'tuplebase.other.password'])
    expect(secrets.size).toBe(0)
  })

  it('does not collide when names or fields contain dots', async () => {
    const { backend, index, secrets } = fakes()
    const v = new SecretVault(backend, index)
    await v.store('a.b', 'x', 'first')
    await v.store('a', 'b.x', 'second')
    expect(secrets.size).toBe(2)
    await v.deleteConnection('a.b')
    expect(await v.get('a', 'b.x')).toBe('second')
    expect(await v.get('a.b', 'x')).toBeUndefined()
  })

  it('concurrent stores all land in the index', async () => {
    const { backend, index } = fakes()
    const v = new SecretVault(backend, index)
    await Promise.all([
      v.store('a', 'password', '1'),
      v.store('b', 'password', '2'),
      v.store('c', 'password', '3'),
    ])
    const deleted = await v.clearAll()
    expect(deleted).toHaveLength(3)
  })
})
