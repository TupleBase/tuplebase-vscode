import * as vscode from 'vscode'
import type { Memento } from 'vscode'

const PREFIX = 'tuplebase.fileConn.'

// which connection a query file runs against (remembered per file); shared by
// the run command and the completion providers
export function getFileConnection(state: Memento, fsPath: string): string | undefined {
  return state.get<string>(PREFIX + fsPath)
}

export function setFileConnection(state: Memento, fsPath: string, conn: string): Thenable<void> {
  return state.update(PREFIX + fsPath, conn)
}

export function clearFileConnection(state: Memento, fsPath: string): Thenable<void> {
  return state.update(PREFIX + fsPath, undefined)
}

// which connection to run against without prompting: the remembered one if
// still valid, else the only candidate; undefined means ask the user
export function resolveConnection(remembered: string | undefined, available: string[]): string | undefined {
  if (remembered && available.includes(remembered)) return remembered
  if (available.length === 1) return available[0]
  return undefined
}

// untitled buffers die with their editor, but VS Code recycles the Untitled-N
// name — drop the binding on close so the next Untitled-N doesn't silently
// run against the old connection
export function registerUntitledBindingCleanup(state: Memento): vscode.Disposable {
  return vscode.workspace.onDidCloseTextDocument(doc => {
    if (doc.uri.scheme === 'untitled') void clearFileConnection(state, doc.uri.fsPath)
  })
}
