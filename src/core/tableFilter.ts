import * as vscode from 'vscode'

export interface TableFilter {
  include: string[]   // TreeNode labels kept visible, matched exactly and case-sensitively
  total: number       // how many tables existed when the filter was set
}

const STATE_KEY = 'tuplebase.tableFilters'

// NUL can't occur in a connection name or an adapter-generated node id, so it is
// a safe separator for the composite key.
const keyFor = (connName: string, parentId: string) => `${connName}\0${parentId}`

// A node owns the table filter when its kind matches the adapter's `tableParent`
// — 'connection' for flat engines, 'schema' for engines with a schema level.
// That naming is the whole rule; there is nothing else to special-case.
export const ownsTableFilter = (tableParent: string | undefined, nodeKind: string): boolean =>
  tableParent !== undefined && nodeKind === tableParent

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
    const next = { ...this.all() }
    delete next[keyFor(connName, parentId)]
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
