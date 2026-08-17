import { describe, expect, it } from 'vitest'
import type { Adapter, AdapterFactory, ExecuteOptions, TreeNode } from '../adapters/types'
import type { TupleBaseConfig } from '../core/config'
import { McpService, type McpServiceOptions } from './service'
import type { SecretSource } from './secrets'

const NODES: TreeNode[] = [{ id: 't1', label: 'users', kind: 'table', hasChildren: true }]

function fakeFactory(recorder: { executed: string[] }, requiredSecrets: string[] = []): AdapterFactory {
  const adapter: Adapter = {
    id: 'postgres',
    connect: async () => {},
    testConnection: async () => {},
    execute: async (stmt: string, _opts: ExecuteOptions) => {
      recorder.executed.push(stmt)
      return { columns: [{ name: 'id' }, { name: 'name' }], rows: [[1, 'ada']], rowCount: 1, elapsedMs: 2, warnings: [] }
    },
    getChildren: async (node: TreeNode | null) => (node === null ? NODES : []),
    searchItems: async () => [],
    dispose: async () => {},
  }
  return {
    id: 'postgres',
    validate: () => [],
    requiredSecrets: () => requiredSecrets,
    create: () => adapter,
  }
}

const config: TupleBaseConfig = {
  version: 1,
  groups: ['g'],
  connections: {
    ro: { name: 'ro', group: 'g', adapter: 'postgres', readonly: true },
    rw: { name: 'rw', group: 'g', adapter: 'postgres', readonly: false },
  },
}

const noSecrets: SecretSource = { get: () => undefined }

function make(options: McpServiceOptions = {}, requiredSecrets: string[] = []) {
  const recorder = { executed: [] as string[] }
  const factories = new Map<string, AdapterFactory>([['postgres', fakeFactory(recorder, requiredSecrets)]])
  const secrets: SecretSource = requiredSecrets.length ? { get: () => 'secret' } : noSecrets
  return { service: new McpService(config, factories, secrets, options), recorder }
}

describe('McpService.listConnections', () => {
  it('marks every connection read-only for agents by default', () => {
    const { service } = make()
    expect(service.listConnections()).toEqual([
      { name: 'ro', group: 'g', adapter: 'postgres', readonly: true, tunneled: false },
      { name: 'rw', group: 'g', adapter: 'postgres', readonly: true, tunneled: false },
    ])
  })

  it('respects per-connection readonly once writes are allowed', () => {
    const { service } = make({ allowWrites: true })
    expect(service.listConnections().map(c => c.readonly)).toEqual([true, false])
  })
})

describe('McpService.runQuery', () => {
  it('runs reads and returns rows as objects', async () => {
    const { service, recorder } = make()
    const res = await service.runQuery('rw', 'select * from users')
    expect(recorder.executed).toEqual(['select * from users'])
    expect(res).toMatchObject({ columns: ['id', 'name'], rows: [{ id: 1, name: 'ada' }], rowCount: 1 })
  })

  it('blocks writes by default, even on a non-readonly connection', async () => {
    const { service, recorder } = make()
    await expect(service.runQuery('rw', 'delete from users')).rejects.toThrow(/read-only for agents/)
    expect(recorder.executed).toEqual([])
  })

  it('allows writes only when enabled and the connection is not readonly', async () => {
    const { service, recorder } = make({ allowWrites: true })
    await service.runQuery('rw', 'delete from users')
    expect(recorder.executed).toEqual(['delete from users'])
    await expect(service.runQuery('ro', 'delete from users')).rejects.toThrow(/read-only for agents/)
  })

  it('rejects an unknown connection', async () => {
    const { service } = make()
    await expect(service.runQuery('nope', 'select 1')).rejects.toThrow(/Unknown connection/)
  })
})

describe('McpService.inspectSchema', () => {
  it('returns the adapter tree children', async () => {
    const { service } = make()
    expect(await service.inspectSchema('rw')).toEqual(NODES)
  })
})

describe('McpService secrets', () => {
  it('errors with the env var name when a required secret is missing', async () => {
    const recorder = { executed: [] as string[] }
    const factories = new Map<string, AdapterFactory>([['postgres', fakeFactory(recorder, ['password'])]])
    const service = new McpService(config, factories, noSecrets)
    await expect(service.runQuery('rw', 'select 1')).rejects.toThrow(/TUPLEBASE_SECRET_RW_PASSWORD/)
  })
})

describe('McpService connection lifecycle', () => {
  function lifecycleService(connect: () => Promise<void>) {
    let created = 0
    let disposed = 0
    const factory: AdapterFactory = {
      id: 'postgres',
      validate: () => [],
      requiredSecrets: () => [],
      create: () => {
        created++
        return {
          id: 'postgres',
          connect,
          testConnection: async () => {},
          execute: async () => ({ columns: [], rows: [], rowCount: 0, elapsedMs: 0, warnings: [] }),
          getChildren: async () => NODES,
          searchItems: async () => [],
          dispose: async () => { disposed++ },
        }
      },
    }
    const service = new McpService(config, new Map([['postgres', factory]]), noSecrets)
    return { service, created: () => created, disposed: () => disposed }
  }

  it('disposes an adapter whose initial connect fails', async () => {
    const h = lifecycleService(async () => { throw new Error('connect failed') })

    await expect(h.service.runQuery('rw', 'select 1')).rejects.toThrow('connect failed')
    expect(h.created()).toBe(1)
    expect(h.disposed()).toBe(1)
  })

  it('deduplicates concurrent connects for one connection', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const h = lifecycleService(() => gate)
    const schema = h.service.inspectSchema('rw')
    const query = h.service.runQuery('rw', 'select 1')
    release()

    await Promise.all([schema, query])
    expect(h.created()).toBe(1)
    await h.service.dispose()
    expect(h.disposed()).toBe(1)
  })

  it('does not let a pending connection land after shutdown', async () => {
    let started!: () => void
    let release!: () => void
    const didStart = new Promise<void>(resolve => { started = resolve })
    const gate = new Promise<void>(resolve => { release = resolve })
    const h = lifecycleService(async () => { started(); await gate })
    const pending = h.service.runQuery('rw', 'select 1')
    pending.catch(() => {})
    await didStart

    const disposing = h.service.dispose()
    release()
    await disposing
    await expect(pending).rejects.toThrow(/shutting down/i)
    expect(h.disposed()).toBe(1)
  })
})
