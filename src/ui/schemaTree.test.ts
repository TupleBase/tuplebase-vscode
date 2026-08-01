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

  it('placeholder click runs tuplebase.connect for the connection', async () => {
    const provider = makeProvider(false)
    const [placeholder] = await provider.getChildren(connEl)
    const item = provider.getTreeItem(placeholder) as { command?: { command: string; arguments?: unknown[] } }
    expect(item.command?.command).toBe('tuplebase.connect')
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
    expect(item.contextValue).toBe('tuplebase.connection.connected')
    expect(item.iconPath?.id).toBe('database')
  })

  it('renders disconnected state on the connection item', () => {
    const provider = makeProvider(false)
    const item = provider.getTreeItem(connEl) as { contextValue?: string; iconPath?: { id: string } }
    expect(item.contextValue).toBe('tuplebase.connection.disconnected')
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

describe('SchemaTreeProvider db node icons', () => {
  const iconFor = (node: TreeNode) =>
    makeProvider(true).getTreeItem({ type: 'dbnode', connName: 'db1', node }) as {
      iconPath?: { id: string; color?: { id: string } }
    }

  it('uses the bundled font glyphs for schema, table and column', () => {
    expect(iconFor({ id: 's', label: 'public', kind: 'schema', hasChildren: true }).iconPath?.id).toBe('tb-schema')
    expect(iconFor({ id: 't', label: 'users', kind: 'table', hasChildren: true }).iconPath?.id).toBe('tb-table')
    expect(iconFor({ id: 'c', label: 'email', kind: 'column', hasChildren: false }).iconPath?.id).toBe('tb-field')
  })

  it('badges a primary-key column with the tinted key glyph', () => {
    const item = iconFor({ id: 'c', label: 'id', kind: 'column', hasChildren: false, pk: true })
    expect(item.iconPath?.id).toBe('tb-pk')
    expect(item.iconPath?.color?.id).toBe('charts.yellow')
  })

  it('badges a flagged key node too, so Dynamo base-table keys read as primary', () => {
    expect(iconFor({ id: 'k', label: 'pk', kind: 'key', hasChildren: false, pk: true }).iconPath?.id).toBe('tb-pk')
  })

  it('leaves unflagged key nodes on the plain key codicon', () => {
    const item = iconFor({ id: 'k', label: 'session:1', kind: 'key', hasChildren: false })
    expect(item.iconPath?.id).toBe('key')
    expect(item.iconPath?.color).toBeUndefined()
  })

  it('falls back for an unknown kind', () => {
    expect(iconFor({ id: 'x', label: '?', kind: 'wat', hasChildren: false }).iconPath?.id).toBe('circle-outline')
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
    expect(item.contextValue).toBe('tuplebase.group')
    expect(item.iconPath?.id).toBe('folder')
  })
})
