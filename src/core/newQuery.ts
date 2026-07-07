import * as vscode from 'vscode'

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
