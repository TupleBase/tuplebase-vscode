import * as assert from 'node:assert'
import * as vscode from 'vscode'

suite('rowboat smoke', () => {
  test('activates and registers commands', async () => {
    const ext = vscode.extensions.getExtension('felicegeracitano.rowboat')
    assert.ok(ext, 'extension found')
    await ext.activate()
    const commands = await vscode.commands.getCommands(true)
    for (const c of ['rowboat.runQuery', 'rowboat.selectEnvironment', 'rowboat.clearCredentials']) {
      assert.ok(commands.includes(c), `command ${c} registered`)
    }
  })
})
