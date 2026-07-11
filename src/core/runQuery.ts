import * as vscode from 'vscode'
import { BRAND } from './brand'
import { splitAll, statementAt } from './statements'
import { fileStatementSyntax } from './dialect'
import { ConnectionManager } from './connections'
import { ConfigStore } from './configStore'
import { errorMessage } from './errors'
import { getFileConnection, resolveConnection, setFileConnection } from './fileConn'
import { ResultsPanel } from '../ui/resultsPanel'
import { refreshQueryCodeLenses } from '../ui/queryCodeLens'
import { isWriteStatement } from './querySafety'
import { DEFAULT_QUERY_TIMEOUT_MS, queryTimeoutMs } from './queryTimeout'
import { DEFAULT_MAX_ROWS, DEFAULT_PAGE_SIZE, resolvePageSize } from './resultLimits'
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

  const syntaxOf = (doc: vscode.TextDocument) =>
    fileStatementSyntax(manager, store, workspaceState, doc.uri.fsPath, doc.languageId)

  const pickConnection = async (fsPath: string, languageId: string): Promise<string | undefined> => {
    const remembered = getFileConnection(workspaceState, fsPath)
    // only connections whose adapter speaks this editor language, across all groups
    const matching = store.connections()
      .filter(c => manager.factories.get(c.adapter)?.languageId === languageId)
    if (matching.length === 0) {
      void vscode.window.showWarningMessage(`${BRAND}: no ${languageId} connections in .rowboat.json`)
      return undefined
    }
    const available = matching.map(c => c.name)
    const resolved = resolveConnection(remembered, available)
    if (resolved) {
      if (resolved !== remembered) {
        await setFileConnection(workspaceState, fsPath, resolved)
        refreshQueryCodeLenses()
      }
      return resolved
    }
    const picked = await vscode.window.showQuickPick(
      matching.map(c => ({ label: c.name, description: c.group })),
      { placeHolder: 'Run against which connection?' },
    )
    if (picked) {
      await setFileConnection(workspaceState, fsPath, picked.label)
      refreshQueryCodeLenses()
    }
    return picked?.label
  }

  const findDocument = (uri: vscode.Uri): vscode.TextDocument | undefined => {
    const uriString = uri.toString()
    return vscode.window.visibleTextEditors.find(editor => editor.document.uri.toString() === uriString)?.document
      ?? vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uriString)
  }

  const record = (
    group: string, conn: string, adapter: string, languageId: string,
    statement: string, ok: boolean, elapsedMs: number, rowCount?: number,
  ) => {
    try {
      onRan?.({ ts: Date.now(), group, conn, adapter, languageId, statement, ok, elapsedMs, rowCount })
    } catch {
      // history is best-effort — never fail the run over it
    }
  }

  const run = async (arg?: vscode.Uri | { uri?: vscode.Uri; offset?: number }) => {
    let doc: vscode.TextDocument
    let stmt: string | undefined
    if (arg && 'uri' in arg && arg.uri && typeof arg.offset === 'number') {
      const found = findDocument(arg.uri)
      if (!found) return
      doc = found
      stmt = statementAt(doc.getText(), Math.min(arg.offset, doc.getText().length), syntaxOf(doc))?.text
    } else if (arg && 'fsPath' in arg) {
      const found = findDocument(arg)
      if (!found) return
      doc = found
      stmt = statementAt(doc.getText(), 0, syntaxOf(doc))?.text
    } else {
      const editor = vscode.window.activeTextEditor
      if (!editor) return
      doc = editor.document
      stmt = editor.selection.isEmpty
        ? statementAt(doc.getText(), doc.offsetAt(editor.selection.active), syntaxOf(doc))?.text
        : doc.getText(editor.selection)
    }
    if (!stmt || !stmt.trim()) {
      void vscode.window.showWarningMessage(`${BRAND}: no statement at cursor`)
      return
    }
    const connName = await pickConnection(doc.uri.fsPath, doc.languageId)
    if (!connName) return
    const conn = store.connection(connName)
    const adapterId = conn?.adapter ?? ''
    const group = conn?.group ?? ''
    if (store.isReadonly(connName) && isWriteStatement(adapterId, stmt)) {
      void vscode.window.showWarningMessage(`${BRAND}: writes are blocked on read-only connection "${connName}"`)
      return
    }
    inFlight?.abort()
    const mine = new AbortController()
    inFlight = mine
    const signal = mine.signal
    const rowboatCfg = vscode.workspace.getConfiguration('rowboat')
    const timeoutMs = queryTimeoutMs(rowboatCfg.get('queryTimeoutMs', DEFAULT_QUERY_TIMEOUT_MS))
    const pageSize = resolvePageSize(rowboatCfg.get('resultsPageSize', DEFAULT_PAGE_SIZE), rowboatCfg.get('maxRows', DEFAULT_MAX_ROWS))
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      mine.abort()
    }, timeoutMs)
    const cancelledOrSuperseded = () => {
      if (!signal.aborted) return false
      if (inFlight === mine) panel.post({
        type: 'error', index: 0, message: timedOut ? `Timed out after ${timeoutMs}ms` : 'Cancelled',
      })
      return true
    }

    await panel.show()
    panel.post({ type: 'batch', total: 1 })
    panel.post({ type: 'running', index: 0, statement: stmt })
    const started = Date.now()
    try {
      const adapter = await manager.getAdapter(connName)
      if (cancelledOrSuperseded()) return
      const envelope = await adapter.execute(stmt, { pageSize, signal })
      if (cancelledOrSuperseded()) return
      record(group, connName, adapterId, doc.languageId, stmt, true, envelope.elapsedMs, envelope.rowCount)
      panel.post({ type: 'result', index: 0, envelope, statement: stmt })
    } catch (e) {
      if (cancelledOrSuperseded()) return
      record(group, connName, adapterId, doc.languageId, stmt, false, Date.now() - started)
      const message = errorMessage(e)
      panel.post({ type: 'error', index: 0, message: `Error: ${message}` })
      if (AUTH_ERROR_RE.test(message)) {
        const retry = await vscode.window.showErrorMessage(
          `${BRAND}: authentication failed for ${connName}`, 'Re-enter password'
        )
        if (retry) {
          await manager.reconnectWithFreshSecret(connName)
          await run(arg)
        }
      }
    } finally {
      clearTimeout(timeout)
      if (inFlight === mine) inFlight = undefined
    }
  }

  // Run every statement in the file (or selection) as a batch, one result tab
  // each. Shares inFlight with `run`, so a new run or Cancel aborts the batch.
  const runFile = async () => {
    const editor = vscode.window.activeTextEditor
    if (!editor) return
    const doc = editor.document
    const source = editor.selection.isEmpty ? doc.getText() : doc.getText(editor.selection)
    const statements = splitAll(source, syntaxOf(doc)).map(s => s.text)
    if (statements.length === 0) {
      void vscode.window.showWarningMessage(`${BRAND}: no statements to run`)
      return
    }
    const connName = await pickConnection(doc.uri.fsPath, doc.languageId)
    if (!connName) return
    const conn = store.connection(connName)
    const adapterId = conn?.adapter ?? ''
    const group = conn?.group ?? ''
    const readonly = store.isReadonly(connName)

    inFlight?.abort()
    const mine = new AbortController()
    inFlight = mine
    const signal = mine.signal
    const rowboatCfg = vscode.workspace.getConfiguration('rowboat')
    const timeoutMs = queryTimeoutMs(rowboatCfg.get('queryTimeoutMs', DEFAULT_QUERY_TIMEOUT_MS))
    const pageSize = resolvePageSize(rowboatCfg.get('resultsPageSize', DEFAULT_PAGE_SIZE), rowboatCfg.get('maxRows', DEFAULT_MAX_ROWS))

    await panel.show()
    panel.post({ type: 'batch', total: statements.length })

    const adapter = await manager.getAdapter(connName).catch((e: unknown) => {
      if (inFlight === mine) panel.post({ type: 'error', index: 0, message: `Error: ${errorMessage(e)}` })
      return undefined
    })
    if (!adapter) {
      if (inFlight === mine) inFlight = undefined
      return
    }

    for (let index = 0; index < statements.length; index++) {
      if (signal.aborted) break
      const stmt = statements[index]
      if (readonly && isWriteStatement(adapterId, stmt)) {
        panel.post({ type: 'error', index, message: `Writes are blocked on read-only connection "${connName}"` })
        continue
      }
      panel.post({ type: 'running', index, statement: stmt })
      let timedOut = false
      const timer = setTimeout(() => { timedOut = true; mine.abort() }, timeoutMs)
      const started = Date.now()
      try {
        const envelope = await adapter.execute(stmt, { pageSize, signal })
        if (signal.aborted) {
          if (inFlight === mine) panel.post({ type: 'error', index, message: timedOut ? `Timed out after ${timeoutMs}ms` : 'Cancelled' })
          break
        }
        record(group, connName, adapterId, doc.languageId, stmt, true, envelope.elapsedMs, envelope.rowCount)
        panel.post({ type: 'result', index, statement: stmt, envelope })
      } catch (e) {
        if (signal.aborted) {
          if (inFlight === mine) panel.post({ type: 'error', index, message: timedOut ? `Timed out after ${timeoutMs}ms` : 'Cancelled' })
          break
        }
        record(group, connName, adapterId, doc.languageId, stmt, false, Date.now() - started)
        panel.post({ type: 'error', index, message: `Error: ${errorMessage(e)}` })
      } finally {
        clearTimeout(timer)
      }
    }
    if (inFlight === mine) inFlight = undefined
  }

  return vscode.Disposable.from(
    vscode.commands.registerCommand('rowboat.runQuery', run),
    vscode.commands.registerCommand('rowboat.runFile', runFile),
    panel.onCancel(() => inFlight?.abort()),
  )
}
