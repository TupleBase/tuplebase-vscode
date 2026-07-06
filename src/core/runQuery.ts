import * as vscode from 'vscode'
import { statementAt } from './statements'
import { ConnectionManager } from './connections'
import { ConfigStore } from './configStore'
import { getFileConnection, setFileConnection } from './fileConn'
import { ResultsPanel } from '../ui/resultsPanel'

// SASL deliberately excluded: pg config/protocol errors mention it without credentials being wrong; 28P01 covers pg SCRAM rejections
const AUTH_ERROR_RE = /password authentication failed|\b28P01\b|\bWRONGPASS\b|\bNOAUTH\b/i

export function registerRunQuery(
  manager: ConnectionManager,
  store: ConfigStore,
  panel: ResultsPanel,
  workspaceState: vscode.Memento,
): vscode.Disposable {
  let inFlight: AbortController | undefined

  const pickConnection = async (fsPath: string, languageId: string): Promise<string | undefined> => {
    const env = manager.activeEnvironment
    if (!env) {
      void vscode.window.showWarningMessage('Rowboat: no .rowboat.json config found')
      return undefined
    }
    const remembered = getFileConnection(workspaceState, fsPath)
    // only connections whose adapter speaks this editor language
    const available = store.connections(env)
      .filter(c => manager.factories.get(c.adapter)?.languageId === languageId)
      .map(c => c.name)
    if (available.length === 0) {
      void vscode.window.showWarningMessage(`Rowboat: no ${languageId} connections in environment "${env}"`)
      return undefined
    }
    if (remembered && available.includes(remembered)) return remembered
    const picked = await vscode.window.showQuickPick(available, {
      placeHolder: `Run against which ${env} connection?`,
    })
    if (picked) await setFileConnection(workspaceState, fsPath, picked)
    return picked
  }

  const run = async () => {
    const editor = vscode.window.activeTextEditor
    if (!editor) return
    const doc = editor.document
    const stmt = editor.selection.isEmpty
      ? statementAt(doc.getText(), doc.offsetAt(editor.selection.active), doc.languageId)?.text
      : doc.getText(editor.selection)
    if (!stmt || !stmt.trim()) {
      void vscode.window.showWarningMessage('Rowboat: no statement at cursor')
      return
    }
    const connName = await pickConnection(doc.uri.fsPath, doc.languageId)
    if (!connName) return

    inFlight?.abort()
    const mine = new AbortController()
    inFlight = mine
    const signal = mine.signal
    const cancelledOrSuperseded = () => {
      if (!signal.aborted) return false
      if (inFlight === mine) panel.post({ type: 'error', message: 'Cancelled' })
      return true
    }

    await panel.show()
    panel.post({ type: 'running', statement: stmt })
    try {
      const adapter = await manager.getAdapter(connName)
      if (cancelledOrSuperseded()) return
      const envelope = await adapter.execute(stmt, { pageSize: 500, signal })
      if (cancelledOrSuperseded()) return
      panel.post({ type: 'result', envelope, statement: stmt })
    } catch (e) {
      if (cancelledOrSuperseded()) return
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
      if (inFlight === mine) inFlight = undefined
    }
  }

  return vscode.Disposable.from(
    vscode.commands.registerCommand('rowboat.runQuery', run),
    panel.onCancel(() => inFlight?.abort()),
  )
}
