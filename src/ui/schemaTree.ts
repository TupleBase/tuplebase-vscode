import * as vscode from 'vscode'
import type { ConnectionConfig, TreeNode } from '../adapters/types'
import { ConnectionManager } from '../core/connections'
import { ConfigStore } from '../core/configStore'
import { errorMessage } from '../core/errors'

export type ExplorerNode =
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
}

export class SchemaTreeProvider implements vscode.TreeDataProvider<ExplorerNode> {
  private emitter = new vscode.EventEmitter<ExplorerNode | undefined>()
  readonly onDidChangeTreeData = this.emitter.event

  constructor(private manager: ConnectionManager, private store: ConfigStore) {}

  refresh() {
    this.emitter.fire(undefined)
  }

  getTreeItem(el: ExplorerNode): vscode.TreeItem {
    if (el.type === 'connection') {
      const item = new vscode.TreeItem(el.conn.name, vscode.TreeItemCollapsibleState.Collapsed)
      item.description = el.conn.adapter
      item.iconPath = new vscode.ThemeIcon('plug')
      item.contextValue = 'rowboat.connection'
      return item
    }
    const item = new vscode.TreeItem(
      el.node.label,
      el.node.hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
    )
    item.description = el.node.detail
    item.iconPath = new vscode.ThemeIcon(KIND_ICONS[el.node.kind] ?? 'circle-outline')
    item.contextValue = `rowboat.${el.node.kind}`
    return item
  }

  async getChildren(el?: ExplorerNode): Promise<ExplorerNode[]> {
    try {
      if (!el) {
        const env = this.manager.activeEnvironment
        if (!env) return []
        return this.store.connections(env).map(conn => ({ type: 'connection' as const, conn }))
      }
      if (el.type === 'connection') {
        const adapter = await this.manager.getAdapter(el.conn.name)
        const children = await adapter.getChildren(null)
        return children.map(node => ({ type: 'dbnode' as const, connName: el.conn.name, node }))
      }
      const adapter = await this.manager.getAdapter(el.connName)
      const children = await adapter.getChildren(el.node)
      return children.map(node => ({ type: 'dbnode' as const, connName: el.connName, node }))
    } catch (e) {
      void vscode.window.showErrorMessage(`Rowboat: ${errorMessage(e)}`)
      return []
    }
  }
}

export function registerSchemaTree(manager: ConnectionManager, store: ConfigStore): vscode.Disposable {
  const provider = new SchemaTreeProvider(manager, store)
  const view = vscode.window.createTreeView('rowboat.explorer', { treeDataProvider: provider })
  return vscode.Disposable.from(
    view,
    store.onDidChange(() => provider.refresh()),
    manager.onDidChangeEnvironment(() => provider.refresh()),
    vscode.commands.registerCommand('rowboat.refreshExplorer', () => provider.refresh()),
    vscode.commands.registerCommand('rowboat.disconnect', async (el?: ExplorerNode) => {
      if (el?.type === 'connection') {
        try {
          await manager.disconnect(el.conn.name)
        } catch {
          await manager.disposeAll()
        }
        provider.refresh()
      }
    }),
  )
}
