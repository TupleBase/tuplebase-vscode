import * as vscode from 'vscode'
import { BRAND } from './core/brand'
import { ConfigStore } from './core/configStore'
import { SecretVault } from './core/secrets'
import { ConnectionManager } from './core/connections'
import { createEnvStatusBar } from './ui/statusBar'
import { registerSchemaTree } from './ui/schemaTree'
import { ResultsPanel } from './ui/resultsPanel'
import { registerRunQuery } from './core/runQuery'
import { registerSqlCompletion } from './completion/sql'
import { registerRedisCompletion } from './completion/redis'
import { registerNewQuery, registerNewQueryOnConnection } from './core/newQuery'
import { HistoryStore } from './core/history'
import { registerHistoryTree } from './ui/historyTree'
import { registerUntitledBindingCleanup } from './core/fileConn'
import { registerQueryCodeLens } from './ui/queryCodeLens'

export async function activate(context: vscode.ExtensionContext) {
  const diagnostics = vscode.languages.createDiagnosticCollection('rowboat')
  const store = new ConfigStore(diagnostics)
  const vault = new SecretVault(context.secrets, context.globalState)
  const manager = new ConnectionManager(store, vault, context.workspaceState)
  const panel = ResultsPanel.register(context)
  // storageUri is undefined without a workspace — no place for history, skip it
  const history = context.storageUri ? new HistoryStore(context.storageUri.fsPath) : undefined
  const historyTree = history ? registerHistoryTree(history, context.workspaceState) : undefined

  context.subscriptions.push(
    diagnostics,
    store,
    manager,
    createEnvStatusBar(manager, store),
    registerSchemaTree(manager, store),
    registerRunQuery(manager, store, panel, context.workspaceState, entry => {
      history?.append(entry)
      historyTree?.refresh()
    }),
    ...(historyTree ? [historyTree] : []),
    registerSqlCompletion(manager, store, context.workspaceState),
    registerRedisCompletion(manager, store, context.workspaceState),
    registerNewQuery(),
    registerNewQueryOnConnection(manager, context.workspaceState),
    registerUntitledBindingCleanup(context.workspaceState),
    registerQueryCodeLens(manager, store, context.workspaceState),
    vscode.commands.registerCommand('rowboat.clearCredentials', async () => {
      const deleted = await vault.clearAll()
      void vscode.window.showInformationMessage(`${BRAND}: cleared ${deleted.length} stored secret(s)`)
    }),
    vscode.commands.registerCommand('rowboat.createConfig', async () => {
      const folder = vscode.workspace.workspaceFolders?.[0]
      if (!folder) {
        void vscode.window.showErrorMessage(`${BRAND}: open a folder first — the config file lives at the workspace root.`)
        return
      }
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
