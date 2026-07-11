import type * as vscode from 'vscode'
import type { StatementSyntax } from '../adapters/types'
import { ConnectionManager } from './connections'
import { ConfigStore } from './configStore'
import { getFileConnection } from './fileConn'

// The statement syntax for a file: whatever the adapter of the connection bound
// to it declares, else a language default (redis is line-based, everything else
// is SQL). Lets DynamoDB files split as PartiQL while postgres files keep
// dollar-quoting, even though both use the 'sql' editor language.
export function fileStatementSyntax(
  manager: ConnectionManager,
  store: ConfigStore,
  workspaceState: vscode.Memento,
  fsPath: string,
  languageId: string,
): StatementSyntax {
  const connName = getFileConnection(workspaceState, fsPath)
  const adapter = connName ? store.connection(connName)?.adapter : undefined
  const syntax = adapter ? manager.factories.get(adapter)?.statementSyntax : undefined
  return syntax ?? (languageId === 'redis' ? 'redis' : 'sql')
}
