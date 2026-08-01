import { describe, expect, it, vi } from 'vitest'

vi.mock('vscode', () => ({
  EventEmitter: class {
    private listeners = new Set<() => void>()
    event = (fn: () => void) => {
      this.listeners.add(fn)
      return { dispose: () => this.listeners.delete(fn) }
    }
    fire() {
      for (const fn of this.listeners) fn()
    }
    dispose() {}
  },
}))

import { TableFilterStore, ownsTableFilter } from './tableFilter'

function fakeMemento() {
  const data = new Map<string, unknown>()
  return {
    get: (key: string) => data.get(key),
    update: async (key: string, value: unknown) => {
      data.set(key, value)
    },
    keys: () => [...data.keys()],
  }
}

const newStore = () => new TableFilterStore(fakeMemento() as never)

describe('TableFilterStore', () => {
  it('round-trips a filter', async () => {
    const store = newStore()
    await store.set('db1', 'pg:public', { include: ['orders'], total: 500 })
    expect(store.get('db1', 'pg:public')).toEqual({ include: ['orders'], total: 500 })
  })

  it('returns undefined when nothing is stored', () => {
    expect(newStore().get('db1', 'pg:public')).toBeUndefined()
  })

  it('clear removes only the one filter', async () => {
    const store = newStore()
    await store.set('db1', 'pg:public', { include: ['orders'], total: 500 })
    await store.set('db1', 'pg:analytics', { include: ['events'], total: 20 })
    await store.clear('db1', 'pg:public')
    expect(store.get('db1', 'pg:public')).toBeUndefined()
    expect(store.get('db1', 'pg:analytics')).toEqual({ include: ['events'], total: 20 })
  })

  it('keeps the same schema name separate across connections', async () => {
    const store = newStore()
    await store.set('db1', 'pg:public', { include: ['orders'], total: 500 })
    await store.set('db2', 'pg:public', { include: ['users'], total: 7 })
    expect(store.get('db1', 'pg:public')?.include).toEqual(['orders'])
    expect(store.get('db2', 'pg:public')?.include).toEqual(['users'])
  })

  it('keeps a connection-level filter separate from a schema-level one', async () => {
    const store = newStore()
    await store.set('db1', '', { include: ['orders'], total: 500 })
    await store.set('db1', 'pg:public', { include: ['users'], total: 7 })
    expect(store.get('db1', '')?.include).toEqual(['orders'])
    expect(store.get('db1', 'pg:public')?.include).toEqual(['users'])
  })

  it('fires onDidChange on set and on clear', async () => {
    const store = newStore()
    let fired = 0
    store.onDidChange(() => {
      fired++
    })
    await store.set('db1', 'pg:public', { include: ['orders'], total: 500 })
    await store.clear('db1', 'pg:public')
    expect(fired).toBe(2)
  })
})

describe('ownsTableFilter', () => {
  it('matches the connection node for flat engines', () => {
    expect(ownsTableFilter('connection', 'connection')).toBe(true)
    expect(ownsTableFilter('connection', 'schema')).toBe(false)
  })

  it('matches the schema node for schema-level engines', () => {
    expect(ownsTableFilter('schema', 'schema')).toBe(true)
    expect(ownsTableFilter('schema', 'connection')).toBe(false)
  })

  it('matches nothing for an engine with no tables', () => {
    expect(ownsTableFilter(undefined, 'connection')).toBe(false)
    expect(ownsTableFilter(undefined, 'namespace')).toBe(false)
  })
})
