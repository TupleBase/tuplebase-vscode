import * as vscode from 'vscode'
import { BRAND } from '../core/brand'
import { addConnection } from '../core/configWriter'
import { buildConnection, validate } from '../webview/connFormSpec'
import { ConfigStore } from '../core/configStore'

type Incoming =
  | { type: 'create'; adapter: string; connName: string; values: Record<string, unknown> }
  | { type: 'cancel' }

// The per-group "+" opens this webview panel (an editor tab). The webview picks a
// type and gathers fields; the host stays authoritative: it re-validates, checks
// name uniqueness, then writes the connection into the group via jsonc writeback.
export function registerNewConnectionForm(extensionUri: vscode.Uri, store: ConfigStore): vscode.Disposable {
  return vscode.commands.registerCommand('rowboat.addConnection', async (node?: { type?: string; name?: string }) => {
    const group = node?.type === 'group' ? node.name : undefined
    if (!group) {
      void vscode.window.showWarningMessage(`${BRAND}: use a group's + button to add a connection`)
      return
    }
    const uri = store.configUri
    if (!uri) {
      void vscode.window.showWarningMessage(`${BRAND}: no .rowboat.json — run "Rowboat: Create Config File" first`)
      return
    }

    const panel = vscode.window.createWebviewPanel(
      'rowboat.newConnection',
      `New connection · ${group}`,
      vscode.ViewColumn.Active,
      { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'webview')] },
    )
    panel.webview.html = renderHtml(panel.webview, extensionUri)

    const sub = panel.webview.onDidReceiveMessage(async (msg: Incoming) => {
      if (msg.type === 'cancel') {
        panel.dispose()
        return
      }
      if (msg.type !== 'create') return
      const connName = msg.connName.trim()
      const errors = validate(msg.adapter, connName, msg.values)
      if (store.connection(connName)) errors.push(`A connection named "${connName}" already exists`)
      if (errors.length) {
        void panel.webview.postMessage({ type: 'error', errors })
        return
      }
      try {
        const text = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8')
        const conn = buildConnection(msg.adapter, msg.values)
        await vscode.workspace.fs.writeFile(uri, Buffer.from(addConnection(text, group, connName, conn), 'utf8'))
        panel.dispose()
      } catch (e) {
        void panel.webview.postMessage({ type: 'error', errors: [`Failed to write config: ${(e as Error).message}`] })
      }
    })
    panel.onDidDispose(() => sub.dispose())
  })
}

function renderHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
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
<body>
  <div id="app"></div>
  <script src="${js}"></script>
</body>
</html>`
}
