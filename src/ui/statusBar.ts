import { BRAND } from '../core/brand'
import * as vscode from 'vscode'
import { ConnectionManager } from '../core/connections'
import { ConfigStore } from '../core/configStore'

export function createEnvStatusBar(manager: ConnectionManager, store: ConfigStore): vscode.Disposable {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
  item.command = 'rowboat.selectEnvironment'
  const render = () => {
    const env = manager.activeEnvironment
    if (env) {
      item.text = `$(database) ${BRAND}: ${env}`
      item.tooltip = `Select ${BRAND} environment`
      item.show()
    } else {
      item.hide()
    }
  }
  const subs = [
    item,
    manager.onDidChangeEnvironment(render),
    store.onDidChange(render),
    vscode.commands.registerCommand('rowboat.selectEnvironment', async () => {
      const names = store.environmentNames()
      if (!names.length) {
        void vscode.window.showWarningMessage('No environments in .rowboat.json')
        return
      }
      const picked = await vscode.window.showQuickPick(names, { placeHolder: `${BRAND} environment` })
      if (picked) await manager.setActiveEnvironment(picked)
    }),
  ]
  render()
  return vscode.Disposable.from(...subs)
}
