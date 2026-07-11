import * as vscode from 'vscode'
import { ConnectionManager } from '../core/connections'
import { ConfigStore } from '../core/configStore'
import { BRAND } from '../core/brand'
import { getFileConnection, setFileConnection } from '../core/fileConn'
import { splitRedisCommands, splitStatements } from '../core/statements'

const emitter = new vscode.EventEmitter<void>()

// binding changed outside an edit (picker, auto-bind) — recompute lens titles
export function refreshQueryCodeLenses() {
  emitter.fire()
}

export function buildQueryCodeLenses(
  doc: vscode.TextDocument,
  workspaceState: vscode.Memento,
  manager: ConnectionManager,
  store: ConfigStore,
): vscode.CodeLens[] {
  const text = doc.getText()
  const statements = doc.languageId === 'redis' ? splitRedisCommands(text) : splitStatements(text)
  const bound = getFileConnection(workspaceState, doc.uri.fsPath)
  const lenses: vscode.CodeLens[] = []
  for (const stmt of statements) {
    const pos = doc.positionAt(stmt.start)
    const range = new vscode.Range(pos, pos)
    lenses.push(
      // renders as one group: "▶ Run | local-pg" (VS Code joins same-line
      // lenses with a pipe; each segment clicks independently)
      new vscode.CodeLens(range, {
        title: '▶ Run',
        command: 'rowboat.runQuery',
        arguments: [{ uri: doc.uri, offset: stmt.start }],
      }),
      new vscode.CodeLens(range, {
        title: bound ? `${manager.isConnected(bound) ? '$(pass-filled)' : '$(circle-outline)'} ${bound}` : 'select connection…',
        command: 'rowboat.selectConnectionForFile',
        arguments: [doc.uri],
      }),
    )
  }
  return lenses
}

export function registerQueryCodeLens(
  manager: ConnectionManager,
  store: ConfigStore,
  workspaceState: vscode.Memento,
): vscode.Disposable {
  const provider: vscode.CodeLensProvider = {
    onDidChangeCodeLenses: emitter.event,
    provideCodeLenses: doc => buildQueryCodeLenses(doc, workspaceState, manager, store),
  }
  return vscode.Disposable.from(
    vscode.languages.registerCodeLensProvider([{ language: 'sql' }, { language: 'redis' }], provider),
    manager.onDidChangeConnections(() => emitter.fire()),
    store.onDidChange(() => emitter.fire()),
    vscode.commands.registerCommand('rowboat.selectConnectionForFile', async (uri?: vscode.Uri) => {
      const doc = uri
        ? vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString())
        : vscode.window.activeTextEditor?.document
      if (!doc) return
      const matching = store.connections()
        .filter(c => manager.factories.get(c.adapter)?.languageId === doc.languageId)
      if (matching.length === 0) {
        void vscode.window.showWarningMessage(`${BRAND}: no ${doc.languageId} connections in .rowboat.json`)
        return
      }
      const picked = await vscode.window.showQuickPick(
        matching.map(c => ({ label: c.name, description: c.group })),
        { placeHolder: 'Run this file against which connection?' },
      )
      if (!picked) return
      await setFileConnection(workspaceState, doc.uri.fsPath, picked.label)
      emitter.fire()
    }),
  )
}
