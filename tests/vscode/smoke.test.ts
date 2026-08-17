import * as assert from 'node:assert'
import * as vscode from 'vscode'

suite('tuplebase smoke', () => {
  test('activates and registers commands', async () => {
    const ext = vscode.extensions.getExtension('tuplebase.tuplebase')
    assert.ok(ext, 'extension found')
    await ext.activate()
    const commands = await vscode.commands.getCommands(true)
    for (const c of ['tuplebase.runQuery', 'tuplebase.addGroup', 'tuplebase.addConnection', 'tuplebase.clearCredentials']) {
      assert.ok(commands.includes(c), `command ${c} registered`)
    }
  })
})
