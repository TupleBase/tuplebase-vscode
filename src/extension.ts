import * as vscode from 'vscode'
import { ConfigStore } from './core/configStore'
import { SecretVault } from './core/secrets'
import { ConnectionManager } from './core/connections'
import { createEnvStatusBar } from './ui/statusBar'

export async function activate(context: vscode.ExtensionContext) {
  const diagnostics = vscode.languages.createDiagnosticCollection('rowboat')
  const store = new ConfigStore(diagnostics)
  const vault = new SecretVault(context.secrets, context.globalState)
  const manager = new ConnectionManager(store, vault, context.workspaceState)

  context.subscriptions.push(
    diagnostics,
    store,
    manager,
    createEnvStatusBar(manager, store),
    vscode.commands.registerCommand('rowboat.clearCredentials', async () => {
      const deleted = await vault.clearAll()
      void vscode.window.showInformationMessage(`Rowboat: cleared ${deleted.length} stored secret(s)`)
    }),
    vscode.commands.registerCommand('rowboat.createConfig', async () => {
      const folder = vscode.workspace.workspaceFolders?.[0]
      if (!folder) return
      const uri = vscode.Uri.joinPath(folder.uri, '.rowboat.json')
      const template = `{
  // Rowboat config — safe to commit: secrets are never stored here.
  "defaultEnvironment": "dev",
  "environments": {
    "dev": {
      "local-pg": { "adapter": "postgres", "host": "localhost", "port": 5432, "database": "rowboat", "user": "rowboat" }
    }
  }
}
`
      await vscode.workspace.fs.writeFile(uri, Buffer.from(template, 'utf8'))
      await vscode.window.showTextDocument(uri)
    }),
  )

  await store.load()
}

export function deactivate() {}
