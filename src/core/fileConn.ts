import type { Memento } from 'vscode'

const PREFIX = 'rowboat.fileConn.'

// which connection a query file runs against (remembered per file); shared by
// the run command and the completion providers
export function getFileConnection(state: Memento, fsPath: string): string | undefined {
  return state.get<string>(PREFIX + fsPath)
}

export function setFileConnection(state: Memento, fsPath: string, conn: string): Thenable<void> {
  return state.update(PREFIX + fsPath, conn)
}
