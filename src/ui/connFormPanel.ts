import * as vscode from 'vscode'
import { BRAND } from '../core/product'
import { addConnection, removeConnection } from '../core/configWriter'
import { buildConnection, validate, withReadonly } from '../webview/connFormSpec'
import { adapterById, presentations } from '../adapters/registry'
import { ConfigStore } from '../core/configStore'
import { SecretVault } from '../core/secrets'
import type { AdapterPresentation, ConnectionConfig } from '../adapters/types'

const formFields = (adapter: string) => withReadonly(adapterById.get(adapter)?.presentation.fields ?? [])

// Init-payload adapters: presentation + a webview-resolvable logo URI. The SVGs
// live in dist/adapters/<id>/ (shipped by the build's copyAssets step).
export type PickerAdapter = AdapterPresentation & { iconUri?: string }

export function pickerAdapters(
  webview: Pick<vscode.Webview, 'asWebviewUri'>,
  extensionUri: vscode.Uri,
): PickerAdapter[] {
  return presentations().map(p =>
    p.iconFile
      ? {
          ...p,
          iconUri: webview
            .asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'adapters', p.id, p.iconFile))
            .toString(),
        }
      : p,
  )
}

// Default bucket for a connection created from the toolbar (no group chosen).
export const UNGROUPED_GROUP = 'Ungrouped'

interface SecretInput { password?: string; promptEveryTime?: boolean }

type Incoming =
  | { type: 'create'; adapter: string; connName: string; values: Record<string, unknown>; secret?: SecretInput }
  | { type: 'cancel' }

type EditContext = { group: string; conn: ConnectionConfig }

// The per-group "+" (and a connection's Edit) open this webview panel. The webview
// picks a type / edits fields; the host stays authoritative: re-validates, checks
// name uniqueness, then writes into the group via jsonc writeback. Password stays
// out of the config — it goes to the keychain (or is skipped for prompt-every-time).
export function registerNewConnectionForm(
  extensionUri: vscode.Uri,
  store: ConfigStore,
  vault: SecretVault,
): vscode.Disposable {
  const open = async (group: string, edit?: EditContext) => {
    const uri = store.configUri
    if (!uri) {
      void vscode.window.showWarningMessage(`${BRAND}: no .tuplebase.json — run "TupleBase: Create Config File" first`)
      return
    }
    const originalName = edit?.conn.name

    const panel = vscode.window.createWebviewPanel(
      'tuplebase.newConnection',
      edit ? `Edit connection · ${edit.conn.name}` : `New connection · ${group}`,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'dist', 'webview'),
          vscode.Uri.joinPath(extensionUri, 'dist', 'adapters'),
        ],
      },
    )
    const adapters = pickerAdapters(panel.webview, extensionUri)
    const init = edit
      ? { mode: 'edit', group, adapter: edit.conn.adapter, name: edit.conn.name, values: edit.conn, adapters }
      : { mode: 'new', group, adapters }
    panel.webview.html = renderHtml(panel.webview, extensionUri, init)

    const sub = panel.webview.onDidReceiveMessage(async (msg: Incoming) => {
      if (msg.type === 'cancel') {
        panel.dispose()
        return
      }
      if (msg.type !== 'create') return
      const connName = msg.connName.trim()
      const fields = formFields(msg.adapter)
      const errors = validate(fields, connName, msg.values)
      const renamed = originalName !== undefined && connName !== originalName
      if ((originalName === undefined || renamed) && store.connection(connName)) {
        errors.push(`A connection named "${connName}" already exists`)
      }
      if (errors.length) {
        void panel.webview.postMessage({ type: 'error', errors })
        return
      }
      try {
        const conn = buildConnection(msg.adapter, fields, msg.values)
        const promptEveryTime = msg.secret?.promptEveryTime === true
        if (promptEveryTime) conn.promptPassword = true
        let text = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8')
        if (originalName !== undefined && renamed) text = removeConnection(text, group, originalName)
        text = addConnection(text, group, connName, conn)
        await vscode.workspace.fs.writeFile(uri, Buffer.from(text, 'utf8'))
        // keychain: rename clears the old name's secret; store/clear per the choice
        if (renamed && originalName) await vault.delete(originalName, 'password')
        if (promptEveryTime) await vault.delete(connName, 'password')
        else if (msg.secret?.password) await vault.store(connName, 'password', msg.secret.password)
        panel.dispose()
      } catch (e) {
        void panel.webview.postMessage({ type: 'error', errors: [`Failed to write config: ${(e as Error).message}`] })
      }
    })
    panel.onDidDispose(() => sub.dispose())
  }

  return vscode.Disposable.from(
    vscode.commands.registerCommand('tuplebase.addConnection', (node?: { type?: string; name?: string }) => {
      // from a group's "+" → that group; from the explorer toolbar (no node) →
      // a default bucket, created on save. Drag it into a real group afterwards.
      void open(node?.type === 'group' && node.name ? node.name : UNGROUPED_GROUP)
    }),
    vscode.commands.registerCommand('tuplebase.editConnection', (node?: { type?: string; conn?: ConnectionConfig }) => {
      if (node?.type !== 'connection' || !node.conn) return
      void open(node.conn.group, { group: node.conn.group, conn: node.conn })
    }),
  )
}

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

function renderHtml(webview: vscode.Webview, extensionUri: vscode.Uri, init: unknown): string {
  const base = vscode.Uri.joinPath(extensionUri, 'dist', 'webview')
  const js = webview.asWebviewUri(vscode.Uri.joinPath(base, 'connForm.js'))
  const css = webview.asWebviewUri(vscode.Uri.joinPath(base, 'connForm.css'))
  const csp = `default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource}; font-src ${webview.cspSource}; img-src ${webview.cspSource};`
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <link rel="stylesheet" href="${css}">
</head>
<body data-init="${escapeAttr(JSON.stringify(init))}">
  <div id="app"></div>
  <script src="${js}"></script>
</body>
</html>`
}
