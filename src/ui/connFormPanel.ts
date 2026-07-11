import * as vscode from 'vscode'
import { BRAND } from '../core/brand'
import { addConnection, removeConnection } from '../core/configWriter'
import { buildConnection, validate } from '../webview/connFormSpec'
import { ConfigStore } from '../core/configStore'
import type { ConnectionConfig } from '../adapters/types'

type Incoming =
  | { type: 'create'; adapter: string; connName: string; values: Record<string, unknown> }
  | { type: 'cancel' }

type EditContext = { group: string; conn: ConnectionConfig }

// The per-group "+" (and a connection's Edit) open this webview panel. The webview
// picks a type / edits fields; the host stays authoritative: re-validates, checks
// name uniqueness, then writes into the group via jsonc writeback.
export function registerNewConnectionForm(extensionUri: vscode.Uri, store: ConfigStore): vscode.Disposable {
  const open = async (group: string, edit?: EditContext) => {
    const uri = store.configUri
    if (!uri) {
      void vscode.window.showWarningMessage(`${BRAND}: no .rowboat.json — run "Rowboat: Create Config File" first`)
      return
    }
    const init = edit
      ? { mode: 'edit', group, adapter: edit.conn.adapter, name: edit.conn.name, values: edit.conn }
      : { mode: 'new', group }
    const originalName = edit?.conn.name

    const panel = vscode.window.createWebviewPanel(
      'rowboat.newConnection',
      edit ? `Edit connection · ${edit.conn.name}` : `New connection · ${group}`,
      vscode.ViewColumn.Active,
      { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'webview')] },
    )
    panel.webview.html = renderHtml(panel.webview, extensionUri, init)

    const sub = panel.webview.onDidReceiveMessage(async (msg: Incoming) => {
      if (msg.type === 'cancel') {
        panel.dispose()
        return
      }
      if (msg.type !== 'create') return
      const connName = msg.connName.trim()
      const errors = validate(msg.adapter, connName, msg.values)
      const renamed = originalName !== undefined && connName !== originalName
      if ((originalName === undefined || renamed) && store.connection(connName)) {
        errors.push(`A connection named "${connName}" already exists`)
      }
      if (errors.length) {
        void panel.webview.postMessage({ type: 'error', errors })
        return
      }
      try {
        let text = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8')
        if (originalName !== undefined && renamed) text = removeConnection(text, group, originalName)
        text = addConnection(text, group, connName, buildConnection(msg.adapter, msg.values))
        await vscode.workspace.fs.writeFile(uri, Buffer.from(text, 'utf8'))
        panel.dispose()
      } catch (e) {
        void panel.webview.postMessage({ type: 'error', errors: [`Failed to write config: ${(e as Error).message}`] })
      }
    })
    panel.onDidDispose(() => sub.dispose())
  }

  return vscode.Disposable.from(
    vscode.commands.registerCommand('rowboat.addConnection', (node?: { type?: string; name?: string }) => {
      if (node?.type !== 'group' || !node.name) {
        void vscode.window.showWarningMessage(`${BRAND}: use a group's + button to add a connection`)
        return
      }
      void open(node.name)
    }),
    vscode.commands.registerCommand('rowboat.editConnection', (node?: { type?: string; conn?: ConnectionConfig }) => {
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
  const csp = `default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource}; font-src ${webview.cspSource};`
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
