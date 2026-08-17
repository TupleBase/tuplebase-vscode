import * as vscode from 'vscode'
import { BRAND, CONFIG_FILENAME } from './core/product'
import { ConfigStore } from './core/configStore'
import { SecretVault } from './core/secrets'
import { ConnectionManager } from './core/connections'
import { TableFilterStore } from './core/tableFilter'
import { registerSchemaTree } from './ui/schemaTree'
import { ResultsPanel } from './ui/resultsPanel'
import { registerRunQuery } from './core/runQuery'
import { registerCompletions } from './completion/register'
import { registerNewQuery, registerNewQueryOnConnection } from './core/newQuery'
import { HistoryStore } from './core/history'
import { registerHistoryTree } from './ui/historyTree'
import { registerUntitledBindingCleanup } from './core/fileConn'
import { registerQueryCodeLens } from './ui/queryCodeLens'
import { addGroup } from './core/configWriter'
import { registerNewConnectionForm } from './ui/connFormPanel'
import { registerExplorerCommands } from './ui/explorerCommands'
import { registerTableFilterCommands } from './ui/tableFilterCommands'
import { registerMcpConfig } from './ui/mcpConfig'

let activeManager: ConnectionManager | undefined

export async function activate(context: vscode.ExtensionContext) {
  const diagnostics = vscode.languages.createDiagnosticCollection('tuplebase')
  const store = new ConfigStore(diagnostics)
  const vault = new SecretVault(context.secrets, context.globalState)
  const manager = new ConnectionManager(store, vault)
  activeManager = manager
  const filters = new TableFilterStore(context.workspaceState)
  const panel = ResultsPanel.register(context)
  // storageUri is undefined without a workspace — no place for history, skip it
  const history = context.storageUri ? new HistoryStore(context.storageUri.fsPath) : undefined
  const historyTree = history ? registerHistoryTree(history, context.workspaceState) : undefined

  context.subscriptions.push(
    diagnostics,
    store,
    manager,
    store.onDidChange(() => {
      void manager.reconcileConfig().catch(e => {
        void vscode.window.showErrorMessage(`${BRAND}: failed to close changed connection: ${(e as Error).message}`)
      })
    }),
    filters,
    registerSchemaTree(manager, store, filters, context.extensionUri),
    registerNewConnectionForm(context.extensionUri, store, vault, manager),
    registerExplorerCommands(store, manager),
    registerTableFilterCommands(manager, store, filters),
    registerMcpConfig(context.extensionUri, store, vault),
    registerRunQuery(manager, store, panel, context.workspaceState, entry => {
      history?.append(entry)
      historyTree?.refresh()
    }),
    ...(historyTree ? [historyTree] : []),
    registerCompletions(manager, store, context.workspaceState),
    registerNewQuery(),
    registerNewQueryOnConnection(context.workspaceState),
    registerUntitledBindingCleanup(context.workspaceState),
    registerQueryCodeLens(manager, store, context.workspaceState, context.extensionUri),
    vscode.commands.registerCommand('tuplebase.addGroup', async () => {
      const uri = store.configUri
      if (!uri) {
        void vscode.window.showWarningMessage(`${BRAND}: no ${CONFIG_FILENAME} — run "TupleBase: Create Config File" first`)
        return
      }
      const existing = new Set(store.groupNames())
      const name = await vscode.window.showInputBox({
        prompt: 'New group name',
        validateInput: v =>
          !v.trim() ? 'Name required' : existing.has(v.trim()) ? `Group "${v.trim()}" already exists` : undefined,
      })
      if (!name) return
      const text = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8')
      await vscode.workspace.fs.writeFile(uri, Buffer.from(addGroup(text, name.trim()), 'utf8'))
    }),
    vscode.commands.registerCommand('tuplebase.clearCredentials', async () => {
      // Wait for cancelled connects before clearing SecretStorage; otherwise an
      // in-flight prompt could store a credential after clearAll completes.
      let closeError: unknown
      try { await manager.disposeAll() } catch (e) { closeError = e }
      let deleted: string[]
      try { deleted = await vault.clearAll() } catch (e) {
        void vscode.window.showErrorMessage(`${BRAND}: failed to clear stored credentials: ${(e as Error).message}`)
        return
      }
      const message = `${BRAND}: cleared ${deleted.length} stored secret(s)`
      if (closeError) {
        void vscode.window.showWarningMessage(`${message}, but some live connection resources could not be closed`)
      } else {
        void vscode.window.showInformationMessage(message)
      }
    }),
    vscode.commands.registerCommand('tuplebase.createConfig', async () => {
      const folder = vscode.workspace.workspaceFolders?.[0]
      if (!folder) {
        void vscode.window.showErrorMessage(`${BRAND}: open a folder first — the config file lives at the workspace root.`)
        return
      }
      const uri = vscode.Uri.joinPath(folder.uri, CONFIG_FILENAME)
      const template = `{
  // TupleBase config — safe to commit: secrets are never stored here.
  "version": 1,
  "groups": {
    "local": {
      "local-pg": { "adapter": "postgres", "host": "localhost", "port": 5432, "database": "tuplebase", "user": "tuplebase" }
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

export async function deactivate() {
  const manager = activeManager
  activeManager = undefined
  await manager?.disposeAll()
}
