import { describe, expect, it, vi } from 'vitest'

vi.mock('vscode', () => ({
  EventEmitter: class {
    private listeners = new Set<(v: unknown) => void>()
    event = (fn: (v: unknown) => void) => {
      this.listeners.add(fn)
      return { dispose: () => this.listeners.delete(fn) }
    }
    fire(v?: unknown) {
      for (const fn of this.listeners) fn(v)
    }
    dispose() {}
  },
  window: { showInputBox: async () => 'prompted-secret' },
}))

import type { Adapter, AdapterFactory, AdapterModule } from '../adapters/types'
import { ConnectionManager } from './connections'
import type { ConfigStore } from './configStore'
import type { SecretVault } from './secrets'

function makeManager(opts: { connect?: () => Promise<void>; requiredSecrets?: string[] } = {}) {
  const connects: string[] = []
  const disposed: string[] = []
  const makeAdapter = (name: string): Adapter => ({
    id: 'fake',
    connect: opts.connect ?? (async () => {}),
    testConnection: async () => {},
    execute: async () => ({ columns: [], rows: [], rowCount: 0, elapsedMs: 0, warnings: [] }),
    getChildren: async () => [],
    searchItems: async () => [],
    dispose: async () => {
      disposed.push(name)
    },
  })
  const factory: AdapterFactory = {
    id: 'fake',
    validate: () => [],
    requiredSecrets: () => opts.requiredSecrets ?? [],
    create: cfg => {
      connects.push(cfg.name)
      return makeAdapter(cfg.name)
    },
  }
  const modules = new Map<string, AdapterModule>([
    ['fake', {
      presentation: { id: 'fake', label: 'Fake', codicon: 'database', emoji: '?', blurb: '', languageId: 'sql', fields: [] },
      loadFactory: async () => factory,
    }],
  ])
  const store = {
    connection: (name: string) =>
      name === 'db1' ? { name: 'db1', group: 'local', adapter: 'fake', readonly: false }
        : name === 'promptdb' ? { name: 'promptdb', group: 'local', adapter: 'fake', readonly: false, promptPassword: true }
          : undefined,
  } as unknown as ConfigStore
  const deleted: string[] = []
  const stored: string[] = []
  const vault = {
    get: async () => undefined,
    store: async (name: string) => { stored.push(name) },
    deleteConnection: async (name: string) => { deleted.push(name) },
  } as unknown as SecretVault
  const manager = new ConnectionManager(store, vault, modules)
  return { manager, connects, disposed, deleted, stored }
}

describe('ConnectionManager connection state', () => {
  it('is disconnected initially', () => {
    const { manager } = makeManager()
    expect(manager.isConnected('db1')).toBe(false)
  })

  it('is connected after getAdapter, and fires the change event', async () => {
    const { manager } = makeManager()
    const fired: number[] = []
    manager.onDidChangeConnections(() => fired.push(1))
    await manager.getAdapter('db1')
    expect(manager.isConnected('db1')).toBe(true)
    expect(fired).toHaveLength(1)
  })

  it('forgetSecrets disconnects and clears that connection\'s stored secrets', async () => {
    const { manager, disposed, deleted } = makeManager()
    await manager.getAdapter('db1')
    await manager.forgetSecrets('db1')
    expect(manager.isConnected('db1')).toBe(false)
    expect(disposed).toContain('db1')
    expect(deleted).toEqual(['db1'])
  })

  it('stores a prompted secret by default', async () => {
    const { manager, stored } = makeManager({ requiredSecrets: ['password'] })
    await manager.getAdapter('db1')
    expect(stored).toEqual(['db1'])
  })

  it('promptPassword connections prompt every connect and never store', async () => {
    const { manager, stored } = makeManager({ requiredSecrets: ['password'] })
    await manager.getAdapter('promptdb')
    expect(stored).toEqual([])
  })

  it('does not re-fire for an already-live adapter', async () => {
    const { manager, connects } = makeManager()
    const fired: number[] = []
    manager.onDidChangeConnections(() => fired.push(1))
    await manager.getAdapter('db1')
    await manager.getAdapter('db1')
    expect(connects).toHaveLength(1)
    expect(fired).toHaveLength(1)
  })

  it('disconnect clears state and fires the change event', async () => {
    const { manager } = makeManager()
    await manager.getAdapter('db1')
    const fired: number[] = []
    manager.onDidChangeConnections(() => fired.push(1))
    await manager.disconnect('db1')
    expect(manager.isConnected('db1')).toBe(false)
    expect(fired).toHaveLength(1)
  })

  it('disposeAll clears state and fires the change event', async () => {
    const { manager } = makeManager()
    await manager.getAdapter('db1')
    const fired: number[] = []
    manager.onDidChangeConnections(() => fired.push(1))
    await manager.disposeAll()
    expect(manager.isConnected('db1')).toBe(false)
    expect(fired).toHaveLength(1)
  })

  it('unknown connection is never connected and throws on getAdapter', async () => {
    const { manager } = makeManager()
    await manager.getAdapter('db1')
    expect(manager.isConnected('nope')).toBe(false)
    await expect(manager.getAdapter('nope')).rejects.toThrow(/not found/i)
  })

  it('failed connect fires no event, stays disconnected, and can be retried', async () => {
    let calls = 0
    const { manager, connects } = makeManager({
      connect: async () => {
        if (++calls === 1) throw new Error('boom')
      },
    })
    const fired: number[] = []
    manager.onDidChangeConnections(() => fired.push(1))
    await expect(manager.getAdapter('db1')).rejects.toThrow('boom')
    expect(manager.isConnected('db1')).toBe(false)
    expect(fired).toHaveLength(0)
    await manager.getAdapter('db1')
    expect(manager.isConnected('db1')).toBe(true)
    expect(connects).toHaveLength(2)
  })

  it('reconnectWithFreshSecret fires the change event even when the reconnect fails', async () => {
    let calls = 0
    const { manager } = makeManager({
      connect: async () => {
        if (++calls === 2) throw new Error('nope')
      },
    })
    await manager.getAdapter('db1')
    const fired: number[] = []
    manager.onDidChangeConnections(() => fired.push(1))
    await expect(manager.reconnectWithFreshSecret('db1')).rejects.toThrow('nope')
    expect(manager.isConnected('db1')).toBe(false)
    expect(fired).toHaveLength(1)
  })

  it('a connect still pending when disposeAll runs does not resurrect', async () => {
    let release!: () => void
    const gate = new Promise<void>(r => {
      release = r
    })
    const { manager, disposed } = makeManager({ connect: () => gate })
    const pending = manager.getAdapter('db1')
    pending.catch(() => {})
    await manager.disposeAll()
    release()
    await expect(pending).rejects.toThrow(/cancelled/i)
    expect(manager.isConnected('db1')).toBe(false)
    expect(disposed).toEqual(['db1'])
  })
})
