import type {
  Adapter, AdapterFactory, ColumnMeta, ExecuteOptions,
  ItemKind, ResolvedConnection, ResultEnvelope, SchemaItem, TreeNode,
} from './types'
import type {
  AttributeDefinition, DynamoDBClientConfig, KeySchemaElement, TableDescription,
} from '@aws-sdk/client-dynamodb'
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'

const TABLE_PREFIX = 'ddb:'
const GSI_MARK = ':gsi:'

// document items -> grid: union of top-level keys in first-seen order, nested
// values stringified, missing keys null (future document adapters reuse this)
export function flattenItems(items: Record<string, unknown>[]): { columns: ColumnMeta[]; rows: unknown[][] } {
  const names: string[] = []
  const seen = new Set<string>()
  for (const item of items) {
    for (const key of Object.keys(item)) {
      if (!seen.has(key)) { seen.add(key); names.push(key) }
    }
  }
  const cell = (v: unknown): unknown =>
    v === undefined ? null : typeof v === 'object' && v !== null ? JSON.stringify(v) : v
  return {
    columns: names.map(name => ({ name })),
    rows: items.map(item => names.map(name => cell(item[name]))),
  }
}

class DynamoDBAdapter implements Adapter {
  readonly id = 'dynamodb'
  private client: DynamoDBDocumentClient | undefined
  private tableNames: string[] | undefined
  private described = new Map<string, TableDescription>()

  constructor(private cfg: ResolvedConnection) {}

  private async getClient(): Promise<DynamoDBDocumentClient> {
    if (!this.client) {
      const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb')   // lazy: driver loads on first connect
      const { DynamoDBDocumentClient } = await import('@aws-sdk/lib-dynamodb')
      const endpoint = typeof this.cfg.endpoint === 'string' && this.cfg.endpoint !== '' ? this.cfg.endpoint : undefined
      const profile = typeof this.cfg.profile === 'string' && this.cfg.profile !== '' ? this.cfg.profile : undefined
      let credentials: DynamoDBClientConfig['credentials']
      if (profile) {
        const { fromIni } = await import('@aws-sdk/credential-providers')
        credentials = fromIni({ profile })
      } else if (endpoint && !process.env.AWS_ACCESS_KEY_ID) {
        // ponytail: dynamodb-local demands credentials but ignores their value —
        // dummy statics keep local dev zero-setup; set AWS_ACCESS_KEY_ID if a
        // custom endpoint ever needs real ones
        credentials = { accessKeyId: 'local', secretAccessKey: 'local' }
      }
      // otherwise the default node provider chain applies (env, SSO, instance role)
      this.client = DynamoDBDocumentClient.from(new DynamoDBClient({
        region: String(this.cfg.region),
        ...(endpoint ? { endpoint } : {}),
        ...(credentials ? { credentials } : {}),
      }))
    }
    return this.client
  }

  // expired-credential/SSO failures get an actionable hint; other AWS errors
  // surface their message as-is
  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (e) {
      const err = e as Error
      const credentialish = err.name === 'ExpiredTokenException' || err.name === 'CredentialsProviderError'
        || /token is expired|sso/i.test(err.message ?? '')
      if (credentialish && typeof this.cfg.profile === 'string' && this.cfg.profile !== '') {
        throw new Error(`${err.message} — try: aws sso login --profile ${this.cfg.profile}`)
      }
      throw e
    }
  }

  async connect(cfg: ResolvedConnection) {
    await this.testConnection(cfg)
  }

  async testConnection(cfg: ResolvedConnection) {
    this.cfg = cfg
    const client = await this.getClient()
    const { ListTablesCommand } = await import('@aws-sdk/client-dynamodb')
    await this.call(() => client.send(new ListTablesCommand({ Limit: 1 })))
  }

  async execute(stmt: string, opts: ExecuteOptions): Promise<ResultEnvelope> {
    const client = await this.getClient()
    const { ExecuteStatementCommand } = await import('@aws-sdk/lib-dynamodb')
    const started = Date.now()
    const items: Record<string, unknown>[] = []
    let token = opts.pageToken
    do {
      const res = await this.call(() => client.send(new ExecuteStatementCommand({
        Statement: stmt, NextToken: token, Limit: opts.pageSize,
      }), { abortSignal: opts.signal }))
      items.push(...(res.Items ?? []))
      token = res.NextToken
    } while (token && items.length < opts.pageSize)
    const { columns, rows } = flattenItems(items)
    return {
      columns,
      rows,
      rowCount: rows.length,
      elapsedMs: Date.now() - started,
      // writes (INSERT/UPDATE/DELETE) return no items — same envelope as an empty read
      warnings: rows.length === 0 ? ['ok — statement returned no items'] : [],
      ...(token ? { nextPageToken: token } : {}),
    }
  }

  private async listTables(): Promise<string[]> {
    const client = await this.getClient()
    const { ListTablesCommand } = await import('@aws-sdk/client-dynamodb')
    const names: string[] = []
    let start: string | undefined
    do {
      const res = await this.call(() => client.send(new ListTablesCommand({ ExclusiveStartTableName: start })))
      names.push(...(res.TableNames ?? []))
      start = res.LastEvaluatedTableName
    } while (start)
    return names
  }

  private async describe(name: string): Promise<TableDescription> {
    const cached = this.described.get(name)
    if (cached) return cached
    const client = await this.getClient()
    const { DescribeTableCommand } = await import('@aws-sdk/client-dynamodb')
    const res = await this.call(() => client.send(new DescribeTableCommand({ TableName: name })))
    const table = res.Table ?? {}
    this.described.set(name, table)
    return table
  }

  private keyNodes(parentId: string, keys: KeySchemaElement[], defs: AttributeDefinition[]): TreeNode[] {
    return keys.map(k => ({
      id: `${parentId}.${k.AttributeName}`,
      label: String(k.AttributeName),
      kind: 'key',
      hasChildren: false,
      detail: `${k.KeyType === 'HASH' ? 'partition' : 'sort'} key (${
        defs.find(d => d.AttributeName === k.AttributeName)?.AttributeType ?? '?'})`,
    }))
  }

  async getChildren(node: TreeNode | null): Promise<TreeNode[]> {
    if (node === null) {
      this.tableNames = await this.listTables()
      return this.tableNames.map(name => ({
        id: `${TABLE_PREFIX}${name}`, label: name, kind: 'table', hasChildren: true,
      }))
    }
    if (node.kind === 'table') {
      const table = await this.describe(node.id.slice(TABLE_PREFIX.length))
      const out = this.keyNodes(node.id, table.KeySchema ?? [], table.AttributeDefinitions ?? [])
      out.push(...(table.GlobalSecondaryIndexes ?? []).map(gsi => ({
        id: `${node.id}${GSI_MARK}${gsi.IndexName}`,
        label: String(gsi.IndexName),
        kind: 'index',
        hasChildren: true,
        detail: 'GSI',
      })))
      return out
    }
    if (node.kind === 'index') {
      const [tableName, gsiName] = node.id.slice(TABLE_PREFIX.length).split(GSI_MARK)
      const table = await this.describe(tableName)
      const gsi = (table.GlobalSecondaryIndexes ?? []).find(g => g.IndexName === gsiName)
      return gsi ? this.keyNodes(node.id, gsi.KeySchema ?? [], table.AttributeDefinitions ?? []) : []
    }
    return []
  }

  async searchItems(kind: ItemKind, prefix: string): Promise<SchemaItem[]> {
    const p = prefix.toLowerCase()
    if (kind === 'table') {
      this.tableNames ??= await this.listTables()
      return this.tableNames
        .filter(n => n.toLowerCase().startsWith(p))
        .map(name => ({ kind: 'table' as const, name }))
    }
    if (kind === 'column') {
      this.tableNames ??= await this.listTables()
      await Promise.all(this.tableNames.map(name => this.describe(name)))
      // only key attributes are known — dynamo items are schemaless
      return [...this.described].flatMap(([table, desc]) =>
        (desc.AttributeDefinitions ?? [])
          .filter(d => (d.AttributeName ?? '').toLowerCase().startsWith(p))
          .map(d => ({ kind: 'column' as const, name: String(d.AttributeName), parent: table, detail: d.AttributeType }))
      )
    }
    return []
  }

  async dispose() {
    this.client?.destroy()
    this.client = undefined
    this.tableNames = undefined
    this.described.clear()
  }
}

export const dynamodbFactory: AdapterFactory = {
  id: 'dynamodb',
  languageId: 'sql',
  validate(raw) {
    return typeof raw.region === 'string' && raw.region !== '' ? [] : ['region is required']
  },
  requiredSecrets() {
    return []   // AWS credential chain (profile/SSO/env) — never stored
  },
  create(cfg) {
    return new DynamoDBAdapter(cfg)
  },
}
