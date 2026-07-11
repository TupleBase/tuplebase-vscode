import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type {
  Adapter, AdapterFactory, ConnectionConfig, ResolvedConnection, ResultEnvelope, TreeNode,
} from '../adapters/types'
import type { RowboatConfig } from '../core/config'
import { isWriteStatement } from '../core/querySafety'
import { openTunnel, type Tunnel, type TunnelSecrets } from '../core/sshTunnel'
import { adapterById } from '../adapters/registry'
import { secretEnvVar, type SecretSource } from './secrets'

export interface McpServiceOptions {
  allowWrites?: boolean   // default false — agents are read-only
  maxRows?: number        // default 200
  baseDir?: string        // .rowboat.json directory — relative file paths (SQLite) resolve against it
}

export interface ConnectionSummary {
  name: string
  group: string
  adapter: string
  readonly: boolean
  tunneled: boolean
}

export interface QueryResult {
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
  elapsedMs: number
  warnings: string[]
}

// Serves the same adapters, config and read-only guardrail as the extension, but
// standalone (no VS Code): secrets come from the SecretSource, and every
// connection is read-only for agents unless writes are explicitly allowed.
export class McpService {
  private readonly live = new Map<string, Adapter>()
  private readonly tunnels = new Map<string, Tunnel>()
  private readonly maxRows: number
  private readonly allowWrites: boolean
  private readonly baseDir: string | undefined

  constructor(
    private readonly config: RowboatConfig,
    private readonly factories: Map<string, AdapterFactory>,
    private readonly secrets: SecretSource,
    options: McpServiceOptions = {},
  ) {
    this.maxRows = options.maxRows ?? 200
    this.allowWrites = options.allowWrites ?? false
    this.baseDir = options.baseDir
  }

  private effectiveReadonly(cfg: ConnectionConfig): boolean {
    return cfg.readonly || !this.allowWrites
  }

  listConnections(): ConnectionSummary[] {
    return Object.values(this.config.connections).map(c => ({
      name: c.name,
      group: c.group,
      adapter: c.adapter,
      readonly: this.effectiveReadonly(c),
      tunneled: c.ssh !== undefined,
    }))
  }

  private connConfig(name: string): ConnectionConfig {
    const cfg = this.config.connections[name]
    if (!cfg) throw new Error(`Unknown connection "${name}" — call list_connections`)
    return cfg
  }

  private async resolve(cfg: ConnectionConfig, factory: AdapterFactory): Promise<ResolvedConnection> {
    const secrets: Record<string, string> = {}
    for (const field of factory.requiredSecrets(cfg)) {
      const value = this.secrets.get(cfg.name, field)
      if (value === undefined) {
        throw new Error(`Missing secret "${field}" for "${cfg.name}" — set ${secretEnvVar(cfg.name, field)}`)
      }
      secrets[field] = value
    }
    return { ...cfg, secrets, ...(this.baseDir ? { baseDir: this.baseDir } : {}) }
  }

  private async openSshTunnel(cfg: ConnectionConfig): Promise<Tunnel | undefined> {
    const ssh = cfg.ssh
    if (!ssh) return undefined
    const secrets: TunnelSecrets = {}
    if (ssh.privateKey) {
      const keyPath = ssh.privateKey.startsWith('~') ? join(homedir(), ssh.privateKey.slice(1)) : ssh.privateKey
      secrets.privateKey = readFileSync(keyPath)
    }
    if (ssh.passphrase === true) {
      const v = this.secrets.get(cfg.name, 'ssh:passphrase')
      if (v === undefined) throw new Error(`Missing SSH passphrase for "${cfg.name}" — set ${secretEnvVar(cfg.name, 'ssh:passphrase')}`)
      secrets.passphrase = v
    }
    if (ssh.password === true) {
      const v = this.secrets.get(cfg.name, 'ssh:password')
      if (v === undefined) throw new Error(`Missing SSH password for "${cfg.name}" — set ${secretEnvVar(cfg.name, 'ssh:password')}`)
      secrets.password = v
    }
    const portField = adapterById.get(cfg.adapter)?.presentation.fields.find(f => f.key === 'port')
    const defaultPort = typeof portField?.default === 'number' ? portField.default : 22
    const target = { host: typeof cfg.host === 'string' ? cfg.host : 'localhost', port: Number(cfg.port ?? defaultPort) }
    return openTunnel(ssh, target, secrets)
  }

  private async connect(name: string): Promise<Adapter> {
    const existing = this.live.get(name)
    if (existing) return existing
    const cfg = this.connConfig(name)
    const factory = this.factories.get(cfg.adapter)
    if (!factory) throw new Error(`No adapter registered for "${cfg.adapter}"`)
    const errs = factory.validate(cfg)
    if (errs.length) throw new Error(`Invalid config for "${name}": ${errs.join(', ')}`)
    const resolved = await this.resolve(cfg, factory)
    const tunnel = await this.openSshTunnel(cfg)
    const effective = tunnel ? { ...resolved, host: tunnel.host, port: tunnel.port } : resolved
    const adapter = factory.create(effective)
    try {
      await adapter.connect(effective)
    } catch (e) {
      await tunnel?.close().catch(() => {})
      throw e
    }
    this.live.set(name, adapter)
    if (tunnel) this.tunnels.set(name, tunnel)
    return adapter
  }

  // Children of a schema node — root when nodeId/kind are omitted, otherwise the
  // node echoed back from a previous call (adapters read only its id and kind).
  async inspectSchema(name: string, nodeId?: string, kind?: string): Promise<TreeNode[]> {
    const adapter = await this.connect(name)
    const node: TreeNode | null = nodeId
      ? { id: nodeId, kind: kind ?? '', label: '', hasChildren: true }
      : null
    return adapter.getChildren(node)
  }

  async runQuery(name: string, statement: string): Promise<QueryResult> {
    const cfg = this.connConfig(name)
    if (this.effectiveReadonly(cfg) && isWriteStatement(cfg.adapter, statement)) {
      throw new Error(`Write blocked: "${name}" is read-only for agents (start the server with ROWBOAT_MCP_ALLOW_WRITES=1 and clear readonly to allow)`)
    }
    const adapter = await this.connect(name)
    const envelope: ResultEnvelope = await adapter.execute(statement, {
      pageSize: this.maxRows,
      signal: new AbortController().signal,
    })
    const names = envelope.columns.map(c => c.name)
    return {
      columns: names,
      rows: envelope.rows.map(r => Object.fromEntries(names.map((n, i) => [n, r[i]]))),
      rowCount: envelope.rowCount,
      elapsedMs: envelope.elapsedMs,
      warnings: envelope.warnings,
    }
  }

  async dispose(): Promise<void> {
    for (const a of this.live.values()) await a.dispose().catch(() => {})
    for (const t of this.tunnels.values()) await t.close().catch(() => {})
    this.live.clear()
    this.tunnels.clear()
  }
}
