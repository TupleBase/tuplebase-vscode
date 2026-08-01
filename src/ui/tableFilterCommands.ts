import * as vscode from 'vscode'
import type { TreeNode } from '../adapters/types'
import { ConnectionManager } from '../core/connections'
import { ConfigStore } from '../core/configStore'
import { TableFilterStore, ownsTableFilter } from '../core/tableFilter'
import { BRAND } from '../core/product'
import { errorMessage } from '../core/errors'
import { presentationOf } from '../adapters/registry'
import type { ExplorerNode } from './schemaTree'

interface Target {
  connName: string
  parentId: string          // '' for a connection node — it has no TreeNode id
  parentNode: TreeNode | null
  label: string
}

// The node the filter belongs to, or undefined when this node doesn't own one.
// Same rule the tree uses to draw the icon, so the menu and the command can
// never disagree about which node is filterable.
function targetOf(el: ExplorerNode | undefined, store: ConfigStore): Target | undefined {
  if (el?.type === 'connection') {
    if (!ownsTableFilter(presentationOf(el.conn.adapter)?.tableParent, 'connection')) return undefined
    return { connName: el.conn.name, parentId: '', parentNode: null, label: el.conn.name }
  }
  if (el?.type === 'dbnode') {
    const adapterId = store.connection(el.connName)?.adapter
    if (!adapterId || !ownsTableFilter(presentationOf(adapterId)?.tableParent, el.node.kind)) return undefined
    return { connName: el.connName, parentId: el.node.id, parentNode: el.node, label: el.node.label }
  }
  return undefined
}

// Pick which tables the Explorer shows under a schema (or, for engines with no
// schema level, under the connection). View-only — queries, completion and the
// MCP server keep seeing the whole catalog.
export function registerTableFilterCommands(
  manager: ConnectionManager,
  store: ConfigStore,
  filters: TableFilterStore,
): vscode.Disposable {
  return vscode.Disposable.from(
    vscode.commands.registerCommand('tuplebase.filterTables', async (el?: ExplorerNode) => {
      const target = targetOf(el, store)
      if (!target) return
      const adapter = manager.liveAdapter(target.connName)
      if (!adapter) return

      let tables: string[]
      try {
        const children = await adapter.getChildren(target.parentNode)
        tables = children.filter(n => n.kind === 'table').map(n => n.label)
      } catch (e) {
        void vscode.window.showErrorMessage(`${BRAND}: ${errorMessage(e)}`)
        return
      }
      if (tables.length === 0) {
        void vscode.window.showInformationMessage(`${BRAND}: no tables under "${target.label}" to filter.`)
        return
      }

      // No filter yet ⇒ everything starts checked, so accepting unchanged is a no-op.
      const current = filters.get(target.connName, target.parentId)
      const included = current ? new Set(current.include) : undefined
      const picked = await vscode.window.showQuickPick(
        tables.map(label => ({ label, picked: included ? included.has(label) : true })),
        {
          canPickMany: true,
          title: `Filter tables in ${target.label}`,
          placeHolder: 'Type to narrow · check the tables to show in the Explorer',
        },
      )
      if (!picked) return                                    // Esc — leave the filter alone
      if (picked.length === tables.length) {                 // everything checked ⇒ no filter
        await filters.clear(target.connName, target.parentId)
        return
      }
      await filters.set(target.connName, target.parentId, {
        include: picked.map(p => p.label),
        total: tables.length,
      })
    }),

    vscode.commands.registerCommand('tuplebase.clearTableFilter', async (el?: ExplorerNode) => {
      const target = targetOf(el, store)
      if (target) await filters.clear(target.connName, target.parentId)
    }),
  )
}
