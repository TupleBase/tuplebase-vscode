import * as vscode from 'vscode'
import type { ConnectionConfig, TreeNode } from '../adapters/types'
import { ConnectionManager } from '../core/connections'
import { ConfigStore } from '../core/configStore'
import { BRAND } from '../core/product'
import { errorMessage } from '../core/errors'
import { moveConnection } from '../core/configWriter'
import { adapterIcon } from '../core/adapterCatalog'
import { presentationOf } from '../adapters/registry'
import { TableFilterStore, isTableNode } from '../core/tableFilter'

const CONN_MIME = 'application/vnd.tuplebase.connection'

export type ExplorerNode =
  | { type: 'group'; name: string }
  | { type: 'connection'; conn: ConnectionConfig }
  | { type: 'dbnode'; connName: string; node: TreeNode }

// tb-* ids come from the bundled icon font declared in contributes.icons; the
// rest are stock codicons. Both are ThemeIcons, so both follow the editor theme.
const KIND_ICONS: Record<string, string> = {
  schema: 'tb-schema',
  table: 'tb-table',
  column: 'tb-field',
  namespace: 'symbol-namespace',
  key: 'key',
  index: 'list-tree',
  info: 'info',
  connect: 'plug',
}

// A primary-key column gets its own glyph, tinted so it stands out in a long
// column list. Applies to any node kind an adapter flagged — Dynamo marks its
// base-table key nodes, which are kind 'key' rather than 'column'.
function nodeIcon(node: TreeNode): vscode.ThemeIcon {
  if (node.pk) return new vscode.ThemeIcon('tb-pk', new vscode.ThemeColor('charts.yellow'))
  return new vscode.ThemeIcon(KIND_ICONS[node.kind] ?? 'circle-outline')
}

// The node a table filter attaches to — the connection for flat engines, the
// schema node for engines with a schema level; undefined when this node owns no
// filter. One rule, shared by the tree (which draws the state) and the filter
// commands (which edit it), so the two can never disagree.
export interface FilterTarget {
  connName: string
  parentNode: TreeNode | null  // null = the connection root
  parentId: string             // '' for a connection node — it has no TreeNode id
  label: string
}

export function filterTarget(el: ExplorerNode | undefined, store: ConfigStore): FilterTarget | undefined {
  if (el?.type === 'connection') {
    if (presentationOf(el.conn.adapter)?.tableParent !== 'connection') return undefined
    return { connName: el.conn.name, parentNode: null, parentId: '', label: el.conn.name }
  }
  if (el?.type === 'dbnode') {
    const adapterId = store.connection(el.connName)?.adapter
    if (!adapterId || presentationOf(adapterId)?.tableParent !== el.node.kind) return undefined
    return { connName: el.connName, parentNode: el.node, parentId: el.node.id, label: el.node.label }
  }
  return undefined
}

export class SchemaTreeProvider implements vscode.TreeDataProvider<ExplorerNode> {
  private emitter = new vscode.EventEmitter<ExplorerNode | undefined>()
  readonly onDidChangeTreeData = this.emitter.event

  constructor(
    private manager: ConnectionManager,
    private store: ConfigStore,
    private filters: TableFilterStore,
    private extensionUri?: vscode.Uri,
  ) {}

  refresh() {
    this.emitter.fire(undefined)
  }

  // A bundled adapter SVG (green-dot variant when connected) if one exists and we
  // know where dist/ lives; otherwise the themed codicon (green tint = connected).
  private connectionIcon(adapter: string, connected: boolean): vscode.ThemeIcon | vscode.Uri {
    const iconFile = presentationOf(adapter)?.iconFile
    if (iconFile && this.extensionUri) {
      const file = connected ? iconFile.replace(/\.svg$/, '-connected.svg') : iconFile
      return vscode.Uri.joinPath(this.extensionUri, 'dist', 'adapters', adapter, file)
    }
    return new vscode.ThemeIcon(adapterIcon(adapter), connected ? new vscode.ThemeColor('charts.green') : undefined)
  }

  // Stamp the filter state onto the node that owns it: a `.filterable` /
  // `.filtered` contextValue suffix (what the menus key off) and an "N of M"
  // count. Nodes that don't own a filter are left untouched.
  private markFilterState(item: vscode.TreeItem, el: ExplorerNode) {
    const target = filterTarget(el, this.store)
    if (!target) return
    const filter = this.filters.get(target.connName, target.parentId)
    if (!filter) {
      item.contextValue = `${item.contextValue}.filterable`
      return
    }
    item.contextValue = `${item.contextValue}.filtered`
    const count = `${filter.include.length} of ${filter.total}`
    item.description = item.description ? `${item.description} · ${count}` : count
  }

  getTreeItem(el: ExplorerNode): vscode.TreeItem {
    if (el.type === 'group') {
      const item = new vscode.TreeItem(el.name, vscode.TreeItemCollapsibleState.Collapsed)
      item.iconPath = new vscode.ThemeIcon('folder')
      item.contextValue = 'tuplebase.group'
      const conns = this.store.connectionsByGroup(el.name)
      if (conns.length > 0 && conns.every(c => c.readonly)) item.description = '(read-only)'
      return item
    }
    if (el.type === 'connection') {
      const connected = this.manager.isConnected(el.conn.name)
      const item = new vscode.TreeItem(el.conn.name, vscode.TreeItemCollapsibleState.Collapsed)
      item.description = el.conn.adapter
      item.iconPath = this.connectionIcon(el.conn.adapter, connected)
      item.tooltip = `${el.conn.name} (${el.conn.adapter}) — ${connected ? 'connected' : 'not connected'}`
      item.contextValue = connected ? 'tuplebase.connection.connected' : 'tuplebase.connection.disconnected'
      if (connected) this.markFilterState(item, el)
      return item
    }
    const item = new vscode.TreeItem(
      el.node.label,
      el.node.hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
    )
    item.description = el.node.detail
    item.iconPath = nodeIcon(el.node)
    item.contextValue = `tuplebase.${el.node.kind}`
    item.tooltip = el.node.detail ? `${el.node.label} — ${el.node.detail}` : el.node.label
    this.markFilterState(item, el)
    if (el.node.kind === 'connect') {
      item.tooltip = `Connect to ${el.connName}`
      const conn = this.store.connection(el.connName)
      if (conn) {
        item.command = {
          command: 'tuplebase.connect',
          title: 'Connect',
          arguments: [{ type: 'connection', conn } satisfies ExplorerNode],
        }
      }
    }
    return item
  }

  // Table filters are view-only and never hide a non-table sibling — the redis
  // "capped" info row, or any future view/index node that shares the level.
  private visible(connName: string, parentId: string, nodes: TreeNode[]): TreeNode[] {
    const filter = this.filters.get(connName, parentId)
    if (!filter) return nodes
    const include = new Set(filter.include)
    return nodes.filter(n => !isTableNode(n) || include.has(n.label))
  }

  async getChildren(el?: ExplorerNode): Promise<ExplorerNode[]> {
    try {
      if (!el) {
        return this.store.groupNames().map(name => ({ type: 'group' as const, name }))
      }
      if (el.type === 'group') {
        return this.store.connectionsByGroup(el.name).map(conn => ({ type: 'connection' as const, conn }))
      }
      // read-only view of live adapters — expanding never connects, otherwise a
      // refresh after disconnect would silently reconnect expanded nodes
      if (el.type === 'connection') {
        const adapter = this.manager.liveAdapter(el.conn.name)
        if (!adapter) {
          return [{
            type: 'dbnode' as const,
            connName: el.conn.name,
            node: { id: `${el.conn.name}/connect`, label: 'Not connected — click to connect', kind: 'connect', hasChildren: false },
          }]
        }
        const children = await adapter.getChildren(null)
        return this.visible(el.conn.name, '', children)
          .map(node => ({ type: 'dbnode' as const, connName: el.conn.name, node }))
      }
      const adapter = this.manager.liveAdapter(el.connName)
      if (!adapter) return []
      const children = await adapter.getChildren(el.node)
      return this.visible(el.connName, el.node.id, children)
        .map(node => ({ type: 'dbnode' as const, connName: el.connName, node }))
    } catch (e) {
      void vscode.window.showErrorMessage(`${BRAND}: ${errorMessage(e)}`)
      return []
    }
  }
}

// Drag a connection node onto a group to move it there — persisted to
// .tuplebase.json via jsonc writeback; the file watcher refreshes the tree.
function connectionDragAndDrop(store: ConfigStore): vscode.TreeDragAndDropController<ExplorerNode> {
  return {
    dragMimeTypes: [CONN_MIME],
    dropMimeTypes: [CONN_MIME],
    handleDrag(source, dataTransfer) {
      const moving = source
        .filter((n): n is Extract<ExplorerNode, { type: 'connection' }> => n.type === 'connection')
        .map(n => ({ name: n.conn.name, group: n.conn.group }))
      if (moving.length) dataTransfer.set(CONN_MIME, new vscode.DataTransferItem(JSON.stringify(moving)))
    },
    async handleDrop(target, dataTransfer) {
      const item = dataTransfer.get(CONN_MIME)
      const toGroup = target?.type === 'group' ? target.name : target?.type === 'connection' ? target.conn.group : undefined
      const uri = store.configUri
      if (!item || !toGroup || !uri) return
      let moving: { name: string; group: string }[]
      try {
        moving = JSON.parse(await item.asString())
      } catch {
        return
      }
      let text = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8')
      let changed = false
      for (const m of moving) {
        if (m.group !== toGroup) {
          text = moveConnection(text, m.group, toGroup, m.name)
          changed = true
        }
      }
      if (changed) await vscode.workspace.fs.writeFile(uri, Buffer.from(text, 'utf8'))
    },
  }
}

export function registerSchemaTree(
  manager: ConnectionManager,
  store: ConfigStore,
  filters: TableFilterStore,
  extensionUri?: vscode.Uri,
): vscode.Disposable {
  const provider = new SchemaTreeProvider(manager, store, filters, extensionUri)
  const view = vscode.window.createTreeView('tuplebase.explorer', {
    treeDataProvider: provider,
    dragAndDropController: connectionDragAndDrop(store),
  })
  return vscode.Disposable.from(
    view,
    store.onDidChange(() => provider.refresh()),
    manager.onDidChangeConnections(() => provider.refresh()),
    filters.onDidChange(() => provider.refresh()),
    // Refresh re-checks the live connections first: a server that died mid-session
    // would otherwise keep its connected dot until some operation failed.
    vscode.commands.registerCommand('tuplebase.refreshExplorer', async () => {
      await manager.verifyLive()
      provider.refresh()
    }),
    vscode.commands.registerCommand('tuplebase.connect', async (el?: ExplorerNode) => {
      if (el?.type !== 'connection') return
      try {
        await manager.getAdapter(el.conn.name)
      } catch (e) {
        const msg = errorMessage(e)
        // Esc at the password prompt is a user choice, not an error
        if (!msg.startsWith('Connection cancelled')) {
          void vscode.window.showErrorMessage(`${BRAND}: ${msg}`)
        }
      }
    }),
    vscode.commands.registerCommand('tuplebase.disconnect', async (el?: ExplorerNode) => {
      if (el?.type === 'connection') {
        try {
          await manager.disconnect(el.conn.name)
        } catch {
          await manager.disposeAll()
        }
      }
    }),
    vscode.commands.registerCommand('tuplebase.resetCredentials', async (el?: ExplorerNode) => {
      if (el?.type !== 'connection') return
      await manager.forgetSecrets(el.conn.name)
      void vscode.window.showInformationMessage(
        `${BRAND}: cleared saved credentials for "${el.conn.name}" — connect to re-enter.`,
      )
    }),
  )
}
