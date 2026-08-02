import * as vscode from 'vscode'
import type { TreeNode } from '../adapters/types'

// What the filter acts on. The tree asks the negated form (keep everything that
// is not a filtered-out table) and the picker asks the positive form (offer
// these), so the two must agree — hence one definition rather than a `=== 'table'`
// and a `!== 'table'` drifting apart in separate files.
export const isTableNode = (node: TreeNode): boolean => node.kind === 'table'

export interface TableFilter {
  include: string[]   // TreeNode labels kept visible, matched exactly and case-sensitively
  total: number       // how many tables existed when the filter was set
}

const STATE_KEY = 'tuplebase.tableFilters'

// NUL can't occur in a connection name or an adapter-generated node id, so it is
// a safe separator for the composite key.
const keyFor = (connName: string, parentId: string) => `${connName}\0${parentId}`

// Per-workspace record of which tables the Explorer shows. View-only: queries,
// completion and the MCP server always see the full catalog. The connection node
// has no TreeNode id, so connection-level filters key on parentId ''.
export class TableFilterStore {
  private emitter = new vscode.EventEmitter<void>()
  readonly onDidChange = this.emitter.event

  constructor(private state: vscode.Memento) {}

  get(connName: string, parentId: string): TableFilter | undefined {
    return this.all()[keyFor(connName, parentId)]
  }

  async set(connName: string, parentId: string, filter: TableFilter): Promise<void> {
    await this.write({ ...this.all(), [keyFor(connName, parentId)]: filter })
  }

  async clear(connName: string, parentId: string): Promise<void> {
    const key = keyFor(connName, parentId)
    const current = this.all()
    // Accepting the picker unchanged clears an absent filter — the common
    // gesture. Writing then would persist an identical map and fire a tree
    // refresh, which re-queries every expanded node, for no change at all.
    if (!(key in current)) return
    const next = { ...current }
    delete next[key]
    await this.write(next)
  }

  private all(): Record<string, TableFilter> {
    return this.state.get<Record<string, TableFilter>>(STATE_KEY) ?? {}
  }

  private async write(next: Record<string, TableFilter>) {
    await this.state.update(STATE_KEY, next)
    this.emitter.fire()
  }

  dispose() {
    this.emitter.dispose()
  }
}
