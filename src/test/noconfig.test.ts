import * as assert from 'node:assert'
import * as vscode from 'vscode'

// Runs in a workspace WITHOUT .tuplebase.json (see .vscode-test.mjs) — the
// welcome-view scenario. Executing the command must activate the extension
// and create the config, same path as clicking the "Create Config" link.
suite('tuplebase without config', () => {
  test('createConfig creates and opens .tuplebase.json', async () => {
    const folder = vscode.workspace.workspaceFolders?.[0]
    assert.ok(folder, 'workspace folder open')
    const uri = vscode.Uri.joinPath(folder.uri, '.tuplebase.json')
    await vscode.workspace.fs.delete(uri).then(undefined, () => undefined)

    await vscode.commands.executeCommand('tuplebase.createConfig')

    const stat = await vscode.workspace.fs.stat(uri)
    assert.ok(stat.size > 0, '.tuplebase.json created')
    assert.strictEqual(vscode.window.activeTextEditor?.document.uri.fsPath, uri.fsPath)

    // leave the workspace empty so the manual welcome-view launch config works
    await vscode.workspace.fs.delete(uri)
  })
})
