import * as vscode from 'vscode'
import type { ConnectionConfig, TreeNode } from '../adapters/types'
import { ConnectionManager } from '../core/connections'
import { ConfigStore } from '../core/configStore'
import { BRAND } from '../core/brand'
import { errorMessage } from '../core/errors'
import { moveConnection } from '../core/configWriter'
import { adapterIcon } from '../core/adapterCatalog'
import { adapterById } from '../adapters/registry'

const CONN_MIME = 'application/vnd.rowboat.connection'

export type ExplorerNode =
  | { type: 'group'; name: string }
  | { type: 'connection'; conn: ConnectionConfig }
  | { type: 'dbnode'; connName: string; node: TreeNode }

const KIND_ICONS: Record<string, string> = {
  schema: 'symbol-namespace',
  table: 'table',
  column: 'symbol-field',
  namespace: 'folder',
  key: 'key',
  index: 'list-tree',
  info: 'info',
  connect: 'plug',
}

export class SchemaTreeProvider implements vscode.TreeDataProvider<ExplorerNode> {
  private emitter = new vscode.EventEmitter<ExplorerNode | undefined>()
  readonly onDidChangeTreeData = this.emitter.event

  constructor(
    private manager: ConnectionManager,
    private store: ConfigStore,
    private extensionUri?: vscode.Uri,
  ) {}

  refresh() {
    this.emitter.fire(undefined)
  }

  // A bundled adapter SVG (green-dot variant when connected) if one exists and we
  // know where dist/ lives; otherwise the themed codicon (green tint = connected).
  private connectionIcon(adapter: string, connected: boolean): vscode.ThemeIcon | vscode.Uri {
    const iconFile = adapterById.get(adapter)?.presentation.iconFile
    if (iconFile && this.extensionUri) {
      const file = connected ? iconFile.replace(/\.svg$/, '-connected.svg') : iconFile
      return vscode.Uri.joinPath(this.extensionUri, 'dist', 'adapters', adapter, file)
    }
    return new vscode.ThemeIcon(adapterIcon(adapter), connected ? new vscode.ThemeColor('charts.green') : undefined)
  }

  getTreeItem(el: ExplorerNode): vscode.TreeItem {
    if (el.type === 'group') {
      const item = new vscode.TreeItem(el.name, vscode.TreeItemCollapsibleState.Collapsed)
      item.iconPath = new vscode.ThemeIcon('folder')
      item.contextValue = 'rowboat.group'
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
      item.contextValue = connected ? 'rowboat.connection.connected' : 'rowboat.connection.disconnected'
      return item
    }
    const item = new vscode.TreeItem(
      el.node.label,
      el.node.hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
    )
    item.description = el.node.detail
    item.iconPath = new vscode.ThemeIcon(KIND_ICONS[el.node.kind] ?? 'circle-outline')
    item.contextValue = `rowboat.${el.node.kind}`
    item.tooltip = el.node.detail ? `${el.node.label} — ${el.node.detail}` : el.node.label
    if (el.node.kind === 'connect') {
      item.tooltip = `Connect to ${el.connName}`
      const conn = this.store.connection(el.connName)
      if (conn) {
        item.command = {
          command: 'rowboat.connect',
          title: 'Connect',
          arguments: [{ type: 'connection', conn } satisfies ExplorerNode],
        }
      }
    }
    return item
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
        return children.map(node => ({ type: 'dbnode' as const, connName: el.conn.name, node }))
      }
      const adapter = this.manager.liveAdapter(el.connName)
      if (!adapter) return []
      const children = await adapter.getChildren(el.node)
      return children.map(node => ({ type: 'dbnode' as const, connName: el.connName, node }))
    } catch (e) {
      void vscode.window.showErrorMessage(`${BRAND}: ${errorMessage(e)}`)
      return []
    }
  }
}

// Drag a connection node onto a group to move it there — persisted to
// .rowboat.json via jsonc writeback; the file watcher refreshes the tree.
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
  extensionUri?: vscode.Uri,
): vscode.Disposable {
  const provider = new SchemaTreeProvider(manager, store, extensionUri)
  const view = vscode.window.createTreeView('rowboat.explorer', {
    treeDataProvider: provider,
    dragAndDropController: connectionDragAndDrop(store),
  })
  return vscode.Disposable.from(
    view,
    store.onDidChange(() => provider.refresh()),
    manager.onDidChangeConnections(() => provider.refresh()),
    vscode.commands.registerCommand('rowboat.refreshExplorer', () => provider.refresh()),
    vscode.commands.registerCommand('rowboat.connect', async (el?: ExplorerNode) => {
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
    vscode.commands.registerCommand('rowboat.disconnect', async (el?: ExplorerNode) => {
      if (el?.type === 'connection') {
        try {
          await manager.disconnect(el.conn.name)
        } catch {
          await manager.disposeAll()
        }
      }
    }),
    vscode.commands.registerCommand('rowboat.resetCredentials', async (el?: ExplorerNode) => {
      if (el?.type !== 'connection') return
      await manager.forgetSecrets(el.conn.name)
      void vscode.window.showInformationMessage(
        `${BRAND}: cleared saved credentials for "${el.conn.name}" — connect to re-enter.`,
      )
    }),
  )
}
