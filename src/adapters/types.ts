export type AdapterId = string

export interface ConnectionConfig {
  env: string
  name: string
  adapter: AdapterId
  [key: string]: unknown
}

export interface ResolvedConnection extends ConnectionConfig {
  secrets: Record<string, string>
}

export interface ColumnMeta { name: string; type?: string }

export interface ResultEnvelope {
  columns: ColumnMeta[]
  rows: unknown[][]
  rowCount: number
  elapsedMs: number
  warnings: string[]
  nextPageToken?: string
}

export type ItemKind = 'schema' | 'table' | 'column' | 'key' | 'index'

export interface SchemaItem { kind: ItemKind; name: string; parent?: string; detail?: string }

export interface TreeNode {
  id: string
  label: string
  kind: string
  hasChildren: boolean
  detail?: string
}

export interface ExecuteOptions {
  pageSize: number
  signal: AbortSignal
  pageToken?: string
}

export interface Adapter {
  readonly id: AdapterId
  connect(cfg: ResolvedConnection): Promise<void>
  testConnection(cfg: ResolvedConnection): Promise<void>
  execute(stmt: string, opts: ExecuteOptions): Promise<ResultEnvelope>
  getChildren(node: TreeNode | null): Promise<TreeNode[]>
  searchItems(kind: ItemKind, prefix: string): Promise<SchemaItem[]>
  dispose(): Promise<void>
}

export interface AdapterFactory {
  id: AdapterId
  languageId: string   // editor language whose files run against this adapter ('sql', 'redis', …)
  validate(raw: Record<string, unknown>): string[]
  requiredSecrets(cfg: ConnectionConfig): string[]
  create(cfg: ResolvedConnection): Adapter
}
