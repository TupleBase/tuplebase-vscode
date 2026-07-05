import * as vscode from 'vscode'
import { statementAt } from './statements'
import { ConnectionManager } from './connections'
import { ConfigStore } from './configStore'
import { ResultsPanel } from '../ui/resultsPanel'

const FILE_CONN_PREFIX = 'rowboat.fileConn.'
const AUTH_ERROR_RE = /password authentication failed|SASL|28P01/i

export function registerRunQuery(
  manager: ConnectionManager,
  store: ConfigStore,
  panel: ResultsPanel,
  workspaceState: vscode.Memento,
): vscode.Disposable {
  let inFlight: AbortController | undefined

  const pickConnection = async (fsPath: string): Promise<string | undefined> => {
    const env = manager.activeEnvironment
    if (!env) {
      void vscode.window.showWarningMessage('Rowboat: no .rowboat.json config found')
      return undefined
    }
    const key = FILE_CONN_PREFIX + fsPath
    const remembered = workspaceState.get<string>(key)
    const available = store.connections(env).map(c => c.name)
    if (remembered && available.includes(remembered)) return remembered
    const picked = await vscode.window.showQuickPick(available, {
      placeHolder: `Run against which ${env} connection?`,
    })
    if (picked) await workspaceState.update(key, picked)
    return picked
  }

  const run = async () => {
    const editor = vscode.window.activeTextEditor
    if (!editor) return
    const doc = editor.document
    const stmt = editor.selection.isEmpty
      ? statementAt(doc.getText(), doc.offsetAt(editor.selection.active))?.text
      : doc.getText(editor.selection)
    if (!stmt || !stmt.trim()) {
      void vscode.window.showWarningMessage('Rowboat: no statement at cursor')
      return
    }
    const connName = await pickConnection(doc.uri.fsPath)
    if (!connName) return

    inFlight?.abort()
    inFlight = new AbortController()
    const signal = inFlight.signal

    await panel.show()
    panel.post({ type: 'running', statement: stmt })
    try {
      const adapter = await manager.getAdapter(connName)
      const envelope = await adapter.execute(stmt, { pageSize: 500, signal })
      panel.post({ type: 'result', envelope, statement: stmt })
    } catch (e) {
      const message = (e as Error).message
      panel.post({ type: 'error', message: `Error: ${message}` })
      if (AUTH_ERROR_RE.test(message)) {
        const retry = await vscode.window.showErrorMessage(
          `Rowboat: authentication failed for ${connName}`, 'Re-enter password'
        )
        if (retry) {
          await manager.reconnectWithFreshSecret(connName)
          await run()
        }
      }
    } finally {
      inFlight = undefined
    }
  }

  return vscode.Disposable.from(
    vscode.commands.registerCommand('rowboat.runQuery', run),
    panel.onCancel(() => inFlight?.abort()),
  )
}
