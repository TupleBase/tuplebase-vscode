import * as vscode from 'vscode'
import type { ResultEnvelope } from '../adapters/types'

export type ResultsMessage =
  | { type: 'running'; statement: string }
  | { type: 'result'; envelope: ResultEnvelope; statement: string }
  | { type: 'error'; message: string }

export type ResultsRequest = { type: 'cancel' }

export class ResultsPanel implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined
  private pending: ResultsMessage[] = []
  private cancelEmitter = new vscode.EventEmitter<void>()
  readonly onCancel = this.cancelEmitter.event

  constructor(private extensionUri: vscode.Uri) {}

  static register(context: vscode.ExtensionContext): ResultsPanel {
    const panel = new ResultsPanel(context.extensionUri)
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider('rowboat.results', panel),
      panel.cancelEmitter,
    )
    return panel
  }

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview')],
    }
    view.webview.onDidReceiveMessage((msg: ResultsRequest) => {
      if (msg.type === 'cancel') this.cancelEmitter.fire()
    })
    view.webview.html = this.html(view.webview)
    for (const msg of this.pending) void view.webview.postMessage(msg)
    this.pending = []
  }

  async show() {
    await vscode.commands.executeCommand('rowboat.results.focus')
  }

  post(msg: ResultsMessage) {
    if (this.view) void this.view.webview.postMessage(msg)
    else {
      this.pending.push(msg)
      // ponytail: cap at 20, drop oldest — plenty for a running/result pair before resolve; ring buffer if it ever grows
      if (this.pending.length > 20) this.pending.shift()
    }
  }

  private html(webview: vscode.Webview): string {
    const base = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview')
    const js = webview.asWebviewUri(vscode.Uri.joinPath(base, 'results.js'))
    const gridCss = webview.asWebviewUri(vscode.Uri.joinPath(base, 'tabulator.min.css'))
    const css = webview.asWebviewUri(vscode.Uri.joinPath(base, 'results.css'))
    const csp = `default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource}; font-src ${webview.cspSource};`
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <link rel="stylesheet" href="${gridCss}">
  <link rel="stylesheet" href="${css}">
</head>
<body>
  <div id="toolbar">
    <span id="status">Run a query to see results.</span>
    <button id="cancel" hidden>Cancel</button>
  </div>
  <div id="grid"></div>
  <script src="${js}"></script>
</body>
</html>`
  }
}
