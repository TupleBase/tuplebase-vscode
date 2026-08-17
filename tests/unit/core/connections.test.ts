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

import type { Adapter, AdapterFactory, AdapterModule, ConnectionConfig, ResolvedConnection } from '../../../src/adapters/types'
import { ConnectionManager } from '../../../src/core/connections'
import type { ConfigStore } from '../../../src/core/configStore'
import type { SecretVault } from '../../../src/core/secrets'

function makeManager(
  opts: {
    connect?: () => Promise<void>
    testConnection?: () => Promise<void>
    dispose?: () => Promise<void>
    requiredSecrets?: string[]
  } = {},
) {
  const connects: string[] = []
  const created: ResolvedConnection[] = []
  const disposed: string[] = []
  const pinged: string[] = []
  const makeAdapter = (name: string): Adapter => ({
    id: 'fake',
    connect: opts.connect ?? (async () => {}),
    testConnection: async () => {
      pinged.push(name)
      await opts.testConnection?.()
    },
    execute: async () => ({ columns: [], rows: [], rowCount: 0, elapsedMs: 0, warnings: [] }),
    getChildren: async () => [],
    searchItems: async () => [],
    dispose: async () => {
      disposed.push(name)
      await opts.dispose?.()
    },
  })
  const factory: AdapterFactory = {
    id: 'fake',
    validate: () => [],
    requiredSecrets: () => opts.requiredSecrets ?? [],
    create: cfg => {
      connects.push(cfg.name)
      created.push(cfg)
      return makeAdapter(cfg.name)
    },
  }
  const modules = new Map<string, AdapterModule>([
    ['fake', {
      presentation: { id: 'fake', label: 'Fake', codicon: 'database', emoji: '?', blurb: '', languageId: 'sql', fields: [] },
      loadFactory: async () => factory,
    }],
  ])
  const configs = new Map<string, ConnectionConfig>([
    ['db1', { name: 'db1', group: 'local', adapter: 'fake', readonly: false, host: 'old-host' }],
    ['promptdb', { name: 'promptdb', group: 'local', adapter: 'fake', readonly: false, promptPassword: true }],
  ])
  const store = { connection: (name: string) => configs.get(name) } as unknown as ConfigStore
  const deleted: string[] = []
  const stored: string[] = []
  const vault = {
    get: async () => undefined,
    store: async (name: string) => { stored.push(name) },
    deleteConnection: async (name: string) => { deleted.push(name) },
  } as unknown as SecretVault
  const manager = new ConnectionManager(store, vault, modules)
  return {
    manager, connects, created, disposed, deleted, stored, pinged,
    setConfig(name: string, cfg: ConnectionConfig | undefined) {
      if (cfg) configs.set(name, cfg)
      else configs.delete(name)
    },
  }
}

describe('ConnectionManager connection state', () => {
  it('is disconnected initially', () => {
    const { manager } = makeManager()
    expect(manager.isConnected('db1')).toBe(false)
  })

  it('moves through connecting to connected after getAdapter', async () => {
    const { manager } = makeManager()
    const states: string[] = []
    manager.onDidChangeConnections(() => states.push(manager.connectionState('db1').status))
    await manager.getAdapter('db1')
    expect(manager.isConnected('db1')).toBe(true)
    expect(states).toEqual(['connecting', 'connected'])
  })

  it('forgetSecrets disconnects and clears that connection\'s stored secrets', async () => {
    const { manager, disposed, deleted } = makeManager()
    await manager.getAdapter('db1')
    await manager.forgetSecrets('db1')
    expect(manager.isConnected('db1')).toBe(false)
    expect(disposed).toContain('db1')
    expect(deleted).toEqual(['db1'])
  })

  it('forgetSecrets waits for a cancelled connect before deleting its secrets', async () => {
    let started!: () => void
    let release!: () => void
    const didStart = new Promise<void>(resolve => { started = resolve })
    const gate = new Promise<void>(resolve => { release = resolve })
    const { manager, deleted } = makeManager({
      requiredSecrets: ['password'],
      connect: async () => { started(); await gate },
    })
    const connecting = manager.getAdapter('db1')
    connecting.catch(() => {})
    await didStart

    const forgetting = manager.forgetSecrets('db1')
    await Promise.resolve()
    expect(deleted).toEqual([])
    release()
    await forgetting
    await expect(connecting).rejects.toThrow(/cancelled/i)
    expect(deleted).toEqual(['db1'])
  })

  it('forgetSecrets still deletes credentials when closing the adapter fails', async () => {
    const { manager, deleted } = makeManager({ dispose: async () => { throw new Error('close failed') } })
    await manager.getAdapter('db1')
    await expect(manager.forgetSecrets('db1')).rejects.toThrow(/reset credentials/i)
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
    expect(fired).toHaveLength(2)
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

  it('failed connect enters error state, stays disconnected, and can be retried', async () => {
    let calls = 0
    const { manager, connects, disposed } = makeManager({
      connect: async () => {
        if (++calls === 1) throw new Error('boom')
      },
    })
    const fired: number[] = []
    manager.onDidChangeConnections(() => fired.push(1))
    await expect(manager.getAdapter('db1')).rejects.toThrow('boom')
    expect(manager.isConnected('db1')).toBe(false)
    expect(fired).toHaveLength(2)
    expect(manager.connectionState('db1')).toEqual({ status: 'error', message: 'boom' })
    expect(disposed).toEqual(['db1'])
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
    expect(fired).toHaveLength(3)
    expect(manager.connectionState('db1')).toEqual({ status: 'error', message: 'nope' })
  })

  it('verifyLive keeps a connection whose round-trip succeeds', async () => {
    const { manager, pinged } = makeManager()
    await manager.getAdapter('db1')
    const fired: number[] = []
    manager.onDidChangeConnections(() => fired.push(1))
    await manager.verifyLive()
    expect(pinged).toEqual(['db1'])
    expect(manager.isConnected('db1')).toBe(true)
    expect(fired).toHaveLength(2)
    expect(manager.connectionState('db1').status).toBe('connected')
  })

  it('verifyLive drops a connection whose server went away', async () => {
    const { manager, disposed } = makeManager({
      testConnection: async () => {
        throw new Error('Connection lost: The server closed the connection.')
      },
    })
    await manager.getAdapter('db1')
    const fired: number[] = []
    manager.onDidChangeConnections(() => fired.push(1))
    await manager.verifyLive()
    expect(manager.isConnected('db1')).toBe(false)
    expect(disposed).toEqual(['db1'])
    expect(fired).toHaveLength(2)
    expect(manager.connectionState('db1')).toEqual({
      status: 'error', message: 'Connection lost: The server closed the connection.',
    })
  })

  it('verifyLive re-prompts nothing and is a no-op with nothing live', async () => {
    const { manager, pinged } = makeManager({ requiredSecrets: ['password'] })
    const fired: number[] = []
    manager.onDidChangeConnections(() => fired.push(1))
    await manager.verifyLive()
    expect(pinged).toEqual([])
    expect(fired).toHaveLength(0)
  })

  it('a dropped connection reconnects on the next getAdapter', async () => {
    let alive = false
    const { manager, connects } = makeManager({
      testConnection: async () => {
        if (!alive) throw new Error('gone')
      },
    })
    await manager.getAdapter('db1')
    await manager.verifyLive()
    expect(manager.isConnected('db1')).toBe(false)
    alive = true
    await manager.getAdapter('db1')
    expect(manager.isConnected('db1')).toBe(true)
    expect(connects).toEqual(['db1', 'db1'])
  })

  it('a connect still pending when disposeAll runs does not resurrect', async () => {
    let release!: () => void
    const gate = new Promise<void>(r => {
      release = r
    })
    const { manager, disposed } = makeManager({ connect: () => gate })
    const pending = manager.getAdapter('db1')
    pending.catch(() => {})
    const disposing = manager.disposeAll()
    release()
    await disposing
    await expect(pending).rejects.toThrow(/cancelled/i)
    expect(manager.isConnected('db1')).toBe(false)
    expect(disposed).toEqual(['db1'])
  })

  it('replaces a live adapter when driver configuration changes', async () => {
    const { manager, connects, created, disposed, setConfig } = makeManager()
    const first = await manager.getAdapter('db1')
    setConfig('db1', {
      name: 'db1', group: 'local', adapter: 'fake', readonly: false, host: 'new-host',
    })

    const second = await manager.getAdapter('db1')
    expect(second).not.toBe(first)
    expect(created.map(cfg => cfg.host)).toEqual(['old-host', 'new-host'])
    expect(connects).toEqual(['db1', 'db1'])
    expect(disposed).toEqual(['db1'])
  })

  it('reconcileConfig closes removed connections', async () => {
    const { manager, disposed, setConfig } = makeManager()
    await manager.getAdapter('db1')
    setConfig('db1', undefined)

    await manager.reconcileConfig()
    expect(manager.isConnected('db1')).toBe(false)
    expect(disposed).toEqual(['db1'])
  })

  it('reconcileConfig keeps a live adapter for group and read-only changes', async () => {
    const { manager, connects, setConfig } = makeManager()
    await manager.getAdapter('db1')
    setConfig('db1', {
      name: 'db1', group: 'production', adapter: 'fake', readonly: true, host: 'old-host',
    })

    await manager.reconcileConfig()
    expect(manager.isConnected('db1')).toBe(true)
    expect(connects).toEqual(['db1'])
  })

  it('disconnect cancels a connection that is still pending', async () => {
    let started!: () => void
    let release!: () => void
    const didStart = new Promise<void>(resolve => { started = resolve })
    const gate = new Promise<void>(resolve => { release = resolve })
    const { manager, disposed } = makeManager({ connect: async () => { started(); await gate } })
    const pending = manager.getAdapter('db1')
    pending.catch(() => {})
    await didStart

    await manager.disconnect('db1')
    release()
    await expect(pending).rejects.toThrow(/cancelled/i)
    expect(manager.isConnected('db1')).toBe(false)
    expect(disposed).toEqual(['db1'])
  })

  it('disconnect reports cleanup errors after removing the live adapter', async () => {
    const { manager } = makeManager({ dispose: async () => { throw new Error('close failed') } })
    await manager.getAdapter('db1')

    await expect(manager.disconnect('db1')).rejects.toThrow(/close connection resources/i)
    expect(manager.isConnected('db1')).toBe(false)
  })
})
