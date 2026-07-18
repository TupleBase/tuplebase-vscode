import * as vscode from 'vscode'
import { BRAND } from '../core/product'
import { ConfigStore } from '../core/configStore'
import { deleteGroup, removeConnection, renameGroup } from '../core/configWriter'
import type { ConnectionConfig } from '../adapters/types'

type GroupNode = { type?: string; name?: string }
type ConnNode = { type?: string; conn?: ConnectionConfig }

async function read(store: ConfigStore): Promise<{ uri: vscode.Uri; text: string } | undefined> {
  const uri = store.configUri
  if (!uri) {
    void vscode.window.showWarningMessage(`${BRAND}: no .tuplebase.json found`)
    return undefined
  }
  return { uri, text: Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8') }
}

const write = (uri: vscode.Uri, text: string) => vscode.workspace.fs.writeFile(uri, Buffer.from(text, 'utf8'))

// Context-menu CRUD for the explorer. Each command edits .tuplebase.json via
// configWriter (comments preserved) and lets the file watcher refresh the tree.
export function registerExplorerCommands(store: ConfigStore): vscode.Disposable {
  return vscode.Disposable.from(
    vscode.commands.registerCommand('tuplebase.renameGroup', async (node?: GroupNode) => {
      if (node?.type !== 'group' || !node.name) return
      const existing = new Set(store.groupNames())
      const name = await vscode.window.showInputBox({
        prompt: `Rename group "${node.name}"`,
        value: node.name,
        validateInput: v => {
          const t = v.trim()
          if (!t) return 'Name required'
          if (t !== node.name && existing.has(t)) return `Group "${t}" already exists`
          return undefined
        },
      })
      const next = name?.trim()
      if (!next || next === node.name) return
      const cfg = await read(store)
      if (cfg) await write(cfg.uri, renameGroup(cfg.text, node.name, next))
    }),

    vscode.commands.registerCommand('tuplebase.deleteGroup', async (node?: GroupNode) => {
      if (node?.type !== 'group' || !node.name) return
      const count = store.connectionsByGroup(node.name).length
      const ok = await vscode.window.showWarningMessage(
        `Delete group "${node.name}"${count ? ` and its ${count} connection(s)` : ''}?`,
        { modal: true },
        'Delete',
      )
      if (ok !== 'Delete') return
      const cfg = await read(store)
      if (cfg) await write(cfg.uri, deleteGroup(cfg.text, node.name))
    }),

    vscode.commands.registerCommand('tuplebase.removeConnection', async (node?: ConnNode) => {
      if (node?.type !== 'connection' || !node.conn) return
      const ok = await vscode.window.showWarningMessage(
        `Remove connection "${node.conn.name}"?`,
        { modal: true },
        'Remove',
      )
      if (ok !== 'Remove') return
      const cfg = await read(store)
      if (cfg) await write(cfg.uri, removeConnection(cfg.text, node.conn.group, node.conn.name))
    }),
  )
}
