import * as vscode from 'vscode'
import { HistoryStore, HistoryEntry } from '../core/history'
import { setFileConnection } from '../core/fileConn'

class HistoryTreeProvider implements vscode.TreeDataProvider<HistoryEntry> {
  private emitter = new vscode.EventEmitter<HistoryEntry | undefined>()
  readonly onDidChangeTreeData = this.emitter.event

  constructor(private store: HistoryStore) {}

  refresh() {
    this.emitter.fire(undefined)
  }

  getTreeItem(entry: HistoryEntry): vscode.TreeItem {
    const oneLine = entry.statement.replace(/\s+/g, ' ').trim()
    const item = new vscode.TreeItem(oneLine.slice(0, 60))
    item.description = entry.conn
    item.tooltip = `${entry.statement}\n\n${entry.group}/${entry.conn} — ${entry.ok ? 'ok' : 'failed'} in ${entry.elapsedMs}ms`
    item.iconPath = new vscode.ThemeIcon(entry.ok ? 'history' : 'error')
    item.contextValue = 'rowboat.historyEntry'
    item.command = { command: 'rowboat.history.open', title: 'Open From History', arguments: [entry] }
    return item
  }

  getChildren(entry?: HistoryEntry): HistoryEntry[] {
    return entry ? [] : this.store.list(50)
  }
}

export function registerHistoryTree(
  store: HistoryStore,
  workspaceState: vscode.Memento,
): vscode.Disposable & { refresh(): void } {
  const provider = new HistoryTreeProvider(store)
  const view = vscode.window.createTreeView('rowboat.history', { treeDataProvider: provider })

  const open = async (entry: HistoryEntry) => {
    const doc = await vscode.workspace.openTextDocument({ content: entry.statement, language: entry.languageId })
    await vscode.window.showTextDocument(doc)
    await setFileConnection(workspaceState, doc.uri.fsPath, entry.conn)
  }

  const disposable = vscode.Disposable.from(
    view,
    vscode.commands.registerCommand('rowboat.history.open', open),
    vscode.commands.registerCommand('rowboat.history.rerun', async (entry?: HistoryEntry) => {
      if (!entry) return
      await open(entry)
      await vscode.commands.executeCommand('rowboat.runQuery')
    }),
    vscode.commands.registerCommand('rowboat.history.clear', () => {
      store.clear()
      provider.refresh()
    }),
  )
  return { dispose: () => disposable.dispose(), refresh: () => provider.refresh() }
}
