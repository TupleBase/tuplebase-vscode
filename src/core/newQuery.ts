import * as vscode from 'vscode'
import { setFileConnection } from './fileConn'
import { presentationOf } from '../adapters/registry'
import type { ExplorerNode } from '../ui/schemaTree'

const FLAVORS: { label: string; language: string }[] = [
  { label: 'SQL (Postgres)', language: 'sql' },
  { label: 'Redis', language: 'redis' },
  { label: 'PartiQL (DynamoDB)', language: 'sql' },
]

export function registerNewQuery(): vscode.Disposable {
  return vscode.commands.registerCommand('rowboat.newQuery', async () => {
    const picked = await vscode.window.showQuickPick(FLAVORS, {
      placeHolder: 'New query for which engine?',
    })
    if (!picked) return
    const doc = await vscode.workspace.openTextDocument({ language: picked.language })
    await vscode.window.showTextDocument(doc)
  })
}

// scratch editor pre-bound to a connection — cmd+enter runs without the picker
export function registerNewQueryOnConnection(
  workspaceState: vscode.Memento,
): vscode.Disposable {
  return vscode.commands.registerCommand('rowboat.newQueryOnConnection', async (el?: ExplorerNode) => {
    if (el?.type !== 'connection') return
    const language = presentationOf(el.conn.adapter)?.languageId ?? 'sql'
    const doc = await vscode.workspace.openTextDocument({ language })
    await setFileConnection(workspaceState, doc.uri.fsPath, el.conn.name)
    await vscode.window.showTextDocument(doc)
  })
}
