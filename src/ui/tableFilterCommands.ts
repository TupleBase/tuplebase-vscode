import * as vscode from 'vscode'
import { ConnectionManager } from '../core/connections'
import { ConfigStore } from '../core/configStore'
import { TableFilterStore, isTableNode } from '../core/tableFilter'
import { BRAND } from '../core/product'
import { errorMessage } from '../core/errors'
import { filterTarget, type ExplorerNode } from './schemaTree'

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
      const target = filterTarget(el, store)
      if (!target) return
      const adapter = manager.liveAdapter(target.connName)
      if (!adapter) return

      let tables: string[]
      try {
        const children = await adapter.getChildren(target.parentNode)
        tables = children.filter(isTableNode).map(n => n.label)
      } catch (e) {
        void vscode.window.showErrorMessage(`${BRAND}: ${errorMessage(e)}`)
        return
      }
      if (tables.length === 0) {
        void vscode.window.showInformationMessage(`${BRAND}: no tables under "${target.label}" to filter.`)
        return
      }

      // No filter yet ⇒ everything starts checked, so accepting unchanged is a no-op.
      const included = new Set(filters.get(target.connName, target.parentId)?.include ?? tables)
      const picked = await vscode.window.showQuickPick(
        tables.map(label => ({ label, picked: included.has(label) })),
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
      const target = filterTarget(el, store)
      if (target) await filters.clear(target.connName, target.parentId)
    }),
  )
}
