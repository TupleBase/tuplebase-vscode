import * as vscode from 'vscode'
import { statementAt } from './statements'
import { ConnectionManager } from './connections'
import { ConfigStore } from './configStore'
import { errorMessage } from './errors'
import { getFileConnection, resolveConnection, setFileConnection } from './fileConn'
import { ResultsPanel } from '../ui/resultsPanel'
import type { HistoryEntry } from './history'

// SASL deliberately excluded: pg config/protocol errors mention it without credentials being wrong; 28P01 covers pg SCRAM rejections
const AUTH_ERROR_RE = /password authentication failed|\b28P01\b|\bWRONGPASS\b|\bNOAUTH\b/i

export function registerRunQuery(
  manager: ConnectionManager,
  store: ConfigStore,
  panel: ResultsPanel,
  workspaceState: vscode.Memento,
  onRan?: (entry: HistoryEntry) => void,
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
    const resolved = resolveConnection(remembered, available)
    if (resolved) {
      if (resolved !== remembered) await setFileConnection(workspaceState, fsPath, resolved)
      return resolved
    }
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
    const env = manager.activeEnvironment ?? ''
    const adapterId = store.connections(env).find(c => c.name === connName)?.adapter ?? ''
    const record = (ok: boolean, elapsedMs: number, rowCount?: number) => {
      try {
        onRan?.({
          ts: Date.now(), env, conn: connName, adapter: adapterId,
          languageId: doc.languageId, statement: stmt, ok, elapsedMs, rowCount,
        })
      } catch {
        // history is best-effort — never fail the run over it
      }
    }

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
    const started = Date.now()
    try {
      const adapter = await manager.getAdapter(connName)
      if (cancelledOrSuperseded()) return
      const envelope = await adapter.execute(stmt, { pageSize: 500, signal })
      if (cancelledOrSuperseded()) return
      record(true, envelope.elapsedMs, envelope.rowCount)
      panel.post({ type: 'result', envelope, statement: stmt })
    } catch (e) {
      if (cancelledOrSuperseded()) return
      record(false, Date.now() - started)
      const message = errorMessage(e)
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
