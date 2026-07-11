export type AdapterId = string

// Tunnel a host/port connection through an SSH bastion. Paths and names live in
// the config; the key passphrase / SSH password are prompted and kept in the OS
// keychain (never in the file).
export interface SshConfig {
  host: string
  port?: number
  user: string
  privateKey?: string   // path to the private key file
  passphrase?: boolean  // prompt for the key passphrase
  password?: boolean    // prompt for an SSH password
}

export interface ConnectionConfig {
  group: string
  name: string
  adapter: AdapterId
  readonly: boolean
  ssh?: SshConfig
  promptPassword?: boolean   // prompt for the password every connect instead of storing it
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

// How a file of statements is split into runnable units. 'sql' is postgres-tuned
// (dollar-quoting); 'partiql' is DynamoDB's SQL dialect (no dollar-quoting);
// 'redis' and 'kafka' are one command per line. Defaults to 'sql' when a
// presentation omits it.
export type StatementSyntax = 'sql' | 'partiql' | 'redis' | 'kafka'

// How the read-only guard decides whether a statement writes — declared per
// adapter (in its presentation) so the rule lives with the engine, not in core.
// `firstKeyword` = the leading token (SQL/redis/es/kafka); `method` = the
// `.method(` name (mongo); `anyKeyword` scans the whole statement (Cypher puts
// its write clause after a leading MATCH).
export type WriteRule =
  | { mode: 'firstKeywordIn'; keywords: readonly string[] }      // write ⇔ leading token ∈ set (SQL/PartiQL DML+DDL)
  | { mode: 'firstKeywordNotIn'; keywords: readonly string[] }   // write ⇔ leading token ∉ read set (redis/ES/Kafka)
  | { mode: 'anyKeyword'; keywords: readonly string[] }          // write ⇔ any of these appear (Cypher)
  | { mode: 'methodNotIn'; keywords: readonly string[] }         // write ⇔ `.method(` ∉ read set (Mongo)

// The connect-time half of an adapter: what the driver needs. Loaded lazily
// (loadFactory) so its driver import doesn't run until a connection is opened.
export interface AdapterFactory {
  id: AdapterId
  validate(raw: Record<string, unknown>): string[]
  requiredSecrets(cfg: ConnectionConfig): string[]
  create(cfg: ResolvedConnection): Adapter
}

// ── Presentation ─────────────────────────────────────────────────────────────
// Pure per-adapter form/UI metadata. No node or vscode imports so the connection
// webview (browser bundle) can receive it as data. `fields` drives both the form
// and the generated JSON schema; add a field here and it shows up in both.
export interface Field {
  key: string
  label: string
  kind: 'text' | 'number' | 'checkbox' | 'select'
  required?: boolean
  default?: string | number | boolean
  options?: readonly string[]
  description?: string   // surfaced in the generated JSON schema
}

// Eager per-adapter metadata — pure data, no driver/vscode imports. This is the
// "manifest" the extension loads at activation to render the tree, the picker and
// the connection form and to route queries, all without loading any adapter code.
export interface AdapterPresentation {
  id: AdapterId
  label: string
  codicon: string          // fallback tree icon when no bundled SVG
  emoji: string            // connection-form type card
  blurb: string            // one-line card subtitle
  iconFile?: string        // basename of the adapter's bundled SVG, resolved under dist/adapters/<id>/
  languageId: string       // editor language whose files run against this adapter ('sql', 'redis', …)
  statementSyntax?: StatementSyntax
  completionTriggers?: string[]   // trigger chars for completion (eager — the provider loads lazily)
  passwordSecret?: boolean        // uses a password secret — the form offers a credentials section
  writeRule?: WriteRule           // read-only guard classification (omit → treated conservatively as write)
  fields: Field[]
}

// ── Completion ───────────────────────────────────────────────────────────────
// Each adapter contributes its own editor completion. The host registers one
// vscode provider per languageId and dispatches to the descriptor bound to the
// file's connection, so postgres SQL and DynamoDB PartiQL can share 'sql'.
export type CompletionKind = 'keyword' | 'function' | 'table' | 'column' | 'key' | 'value'

export interface CompletionResult {
  label: string
  insertText: string
  kind: CompletionKind
  detail?: string
  documentation?: string
  // replace [replaceFromChar, cursor) on the cursor line instead of the default
  // word range — redis keys contain ':' which the default word pattern splits on
  replaceFromChar?: number
}

export interface CompletionContext {
  languageId: string
  fullText: string
  offset: number
  line: number
  character: number
  linePrefix: string
  connected: boolean   // is the file's connection live? (schema lookups need it)
  // live schema lookup bound to the file's connected adapter; [] when offline
  search(kind: ItemKind, prefix: string): Promise<SchemaItem[]>
}

export interface CompletionContribution {
  provide(ctx: CompletionContext): Promise<CompletionResult[]>
}

// ── Module ───────────────────────────────────────────────────────────────────
// One self-contained plugin per database type (src/adapters/<id>/index.ts). The
// presentation is eager data; the factory and completion are loaded on demand via
// dynamic import so their driver/parsing code stays out of the activation path.
// This is what lets the registry scale to hundreds of adapters with flat startup.
export interface AdapterModule {
  presentation: AdapterPresentation
  loadFactory(): Promise<AdapterFactory>
  loadCompletion?(): Promise<CompletionContribution>
}
