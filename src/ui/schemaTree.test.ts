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
  TreeItem: class {
    constructor(public label: string, public collapsibleState?: number) {}
  },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ThemeIcon: class {
    constructor(public id: string, public color?: unknown) {}
  },
  ThemeColor: class {
    constructor(public id: string) {}
  },
  Uri: {
    joinPath: (base: { path: string }, ...parts: string[]) => ({ path: [base.path, ...parts].join('/') }),
  },
}))

import type { Adapter, ConnectionConfig, TreeNode } from '../adapters/types'
import type { ConnectionManager } from '../core/connections'
import type { ConfigStore } from '../core/configStore'
import { SchemaTreeProvider, type ExplorerNode } from './schemaTree'

const CONN: ConnectionConfig = { group: 'dev', name: 'db1', adapter: 'postgres', readonly: false }

function makeProvider(live: boolean, extensionUri?: { path: string }) {
  const table: TreeNode = { id: 't1', label: 'users', kind: 'table', hasChildren: true }
  const adapter = {
    getChildren: async (node: TreeNode | null) => (node === null ? [table] : []),
  } as unknown as Adapter
  const manager = {
    isConnected: () => live,
    liveAdapter: () => (live ? adapter : undefined),
    getAdapter: () => {
      throw new Error('tree must never connect')
    },
  } as unknown as ConnectionManager
  const store = {
    groupNames: () => ['local'],
    connectionsByGroup: (g: string) => (g === 'local' ? [CONN] : []),
    connections: () => [CONN],
    connection: (name: string) => (name === 'db1' ? CONN : undefined),
  } as unknown as ConfigStore
  return new SchemaTreeProvider(manager, store, extensionUri as never)
}

const connEl: ExplorerNode = { type: 'connection', conn: CONN }

describe('SchemaTreeProvider without a live adapter', () => {
  it('shows a connect placeholder instead of connecting', async () => {
    const provider = makeProvider(false)
    const children = await provider.getChildren(connEl)
    expect(children).toHaveLength(1)
    const only = children[0]
    if (only.type !== 'dbnode') throw new Error('expected dbnode')
    expect(only.node.kind).toBe('connect')
    expect(only.node.hasChildren).toBe(false)
  })

  it('placeholder click runs rowboat.connect for the connection', async () => {
    const provider = makeProvider(false)
    const [placeholder] = await provider.getChildren(connEl)
    const item = provider.getTreeItem(placeholder) as { command?: { command: string; arguments?: unknown[] } }
    expect(item.command?.command).toBe('rowboat.connect')
    expect(item.command?.arguments?.[0]).toMatchObject({ type: 'connection', conn: { name: 'db1' } })
  })

  it('returns no children for stale db nodes', async () => {
    const provider = makeProvider(false)
    const stale: ExplorerNode = {
      type: 'dbnode',
      connName: 'db1',
      node: { id: 't1', label: 'users', kind: 'table', hasChildren: true },
    }
    expect(await provider.getChildren(stale)).toEqual([])
  })
})

describe('SchemaTreeProvider with a live adapter', () => {
  it('lists real children from the adapter', async () => {
    const provider = makeProvider(true)
    const children = await provider.getChildren(connEl)
    expect(children).toHaveLength(1)
    const only = children[0]
    if (only.type !== 'dbnode') throw new Error('expected dbnode')
    expect(only.node.label).toBe('users')
  })

  it('renders connected state on the connection item', () => {
    const provider = makeProvider(true)
    const item = provider.getTreeItem(connEl) as { contextValue?: string; iconPath?: { id: string } }
    expect(item.contextValue).toBe('rowboat.connection.connected')
    expect(item.iconPath?.id).toBe('database')
  })

  it('renders disconnected state on the connection item', () => {
    const provider = makeProvider(false)
    const item = provider.getTreeItem(connEl) as { contextValue?: string; iconPath?: { id: string } }
    expect(item.contextValue).toBe('rowboat.connection.disconnected')
    expect(item.iconPath?.id).toBe('database')
  })

  it('uses the bundled adapter SVG, connected variant, when the extension URI is known', () => {
    const provider = makeProvider(true, { path: '/ext' })
    const item = provider.getTreeItem(connEl) as { iconPath?: { path?: string } }
    expect(item.iconPath?.path).toBe('/ext/dist/adapters/postgres/postgres-connected.svg')
  })

  it('uses the base adapter SVG when disconnected', () => {
    const provider = makeProvider(false, { path: '/ext' })
    const item = provider.getTreeItem(connEl) as { iconPath?: { path?: string } }
    expect(item.iconPath?.path).toBe('/ext/dist/adapters/postgres/postgres.svg')
  })
})

describe('SchemaTreeProvider group hierarchy', () => {
  it('roots at groups, not connections', async () => {
    const provider = makeProvider(false)
    expect(await provider.getChildren()).toEqual([{ type: 'group', name: 'local' }])
  })

  it('expands a group into its connections', async () => {
    const provider = makeProvider(false)
    expect(await provider.getChildren({ type: 'group', name: 'local' })).toEqual([{ type: 'connection', conn: CONN }])
  })

  it('renders a group as a collapsible folder', () => {
    const provider = makeProvider(false)
    const item = provider.getTreeItem({ type: 'group', name: 'local' }) as { label: string; contextValue?: string; iconPath?: { id: string } }
    expect(item.label).toBe('local')
    expect(item.contextValue).toBe('rowboat.group')
    expect(item.iconPath?.id).toBe('folder')
  })
})
