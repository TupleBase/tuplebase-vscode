import * as vscode from 'vscode'
import { BRAND } from '../core/product'
import { ConfigStore } from '../core/configStore'
import { SecretVault } from '../core/secrets'
import { adapterById } from '../adapters/registry'
import { secretEnvVar } from '../mcp/secrets'

// Emit a ready-to-paste MCP client config that launches the bundled server with
// TUPLEBASE_CONFIG and the connection secrets pulled from the OS keychain — the
// bridge between VS Code's SecretStorage and the standalone server's env.
export function registerMcpConfig(
  extensionUri: vscode.Uri,
  store: ConfigStore,
  vault: SecretVault,
): vscode.Disposable {
  return vscode.commands.registerCommand('tuplebase.showMcpConfig', async () => {
    const serverPath = vscode.Uri.joinPath(extensionUri, 'dist', 'mcp', 'server.js').fsPath
    const env: Record<string, string> = {}
    if (store.configUri) env.TUPLEBASE_CONFIG = store.configUri.fsPath

    let missing = 0
    for (const cfg of store.connections()) {
      const factory = await adapterById.get(cfg.adapter)?.loadFactory()
      const fields = [...(factory?.requiredSecrets(cfg) ?? [])]
      if (cfg.ssh?.passphrase) fields.push('ssh:passphrase')
      if (cfg.ssh?.password) fields.push('ssh:password')
      for (const field of fields) {
        const value = await vault.get(cfg.name, field)
        if (value === undefined) missing++
        else env[secretEnvVar(cfg.name, field)] = value
      }
    }

    const config = { mcpServers: { tuplebase: { command: 'node', args: [serverPath], env } } }
    const doc = await vscode.workspace.openTextDocument({
      language: 'json',
      content: JSON.stringify(config, null, 2),
    })
    await vscode.window.showTextDocument(doc)
    void vscode.window.showInformationMessage(
      missing > 0
        ? `${BRAND}: MCP config generated — but ${missing} secret(s) aren't stored yet. Connect those in TupleBase, then regenerate.`
        : `${BRAND}: MCP config generated. It contains your stored secrets — paste it into your MCP client.`,
    )
  })
}
