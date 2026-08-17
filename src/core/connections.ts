import * as vscode from 'vscode'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Adapter, AdapterFactory, AdapterModule, ConnectionConfig, ResolvedConnection } from '../adapters/types'
import { adapterById } from '../adapters/registry'
import { ConfigStore } from './configStore'
import { SecretVault } from './secrets'
import { openTunnel, type Tunnel, type TunnelSecrets } from './sshTunnel'

// Everything an open connection owns. `cfg` is what the adapter was opened with
// (secrets already resolved), so it can be re-tested without prompting again.
interface LiveConnection {
  adapter: Adapter
  cfg: ResolvedConnection
  signature: string
  tunnel?: Tunnel   // SSH bastion backing it, when the config asks for one
}

interface PendingConnection {
  generation: number
  signature: string
  promise: Promise<Adapter>
}

// Group/read-only changes affect presentation and query policy, not the driver's
// endpoint. Everything else is part of the identity of the live connection.
function connectionSignature(cfg: ConnectionConfig): string {
  const { group: _group, readonly: _readonly, ...driverConfig } = cfg
  const stable = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stable)
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, child]) => [key, stable(child)]),
      )
    }
    return value
  }
  return JSON.stringify(stable(driverConfig))
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'checking' | 'error'
export interface ConnectionState { status: ConnectionStatus; message?: string }

export class ConnectionManager implements vscode.Disposable {
  private readonly live = new Map<string, LiveConnection>()   // key: connection name (globally unique)
  private readonly pending = new Map<string, PendingConnection>()
  private readonly connecting = new Set<Promise<Adapter>>()
  private readonly generations = new Map<string, number>()
  private readonly states = new Map<string, ConnectionState>()
  private readonly factoryCache = new Map<string, AdapterFactory>()   // lazily loaded, once per adapter type
  private epoch = 0   // bumped by disposeAll so in-flight connects know not to land
  private readonly connEmitter = new vscode.EventEmitter<void>()
  readonly onDidChangeConnections = this.connEmitter.event

  constructor(
    private readonly store: ConfigStore,
    private readonly vault: SecretVault,
    private readonly modules: ReadonlyMap<string, AdapterModule> = adapterById,
  ) {}

  private findConfig(name: string): ConnectionConfig {
    const cfg = this.store.connection(name)
    if (!cfg) throw new Error(`Connection "${name}" not found (.tuplebase.json)`)
    return cfg
  }

  // Load (and cache) an adapter's factory the first time one of its connections
  // is opened — its driver import doesn't run until then.
  private async factory(adapterId: string): Promise<AdapterFactory> {
    const cached = this.factoryCache.get(adapterId)
    if (cached) return cached
    const module = this.modules.get(adapterId)
    if (!module) throw new Error(`No adapter registered for "${adapterId}"`)
    const factory = await module.loadFactory()
    this.factoryCache.set(adapterId, factory)
    return factory
  }

  // Fetch a secret. Normally cached in (and read from) the keychain; when persist
  // is false (promptPassword connections) it is prompted every time and never stored.
  private async getSecret(connName: string, field: string, prompt: string, persist = true): Promise<string> {
    if (persist) {
      const cached = await this.vault.get(connName, field)
      if (cached !== undefined) return cached
    }
    const value = await vscode.window.showInputBox({ password: true, ignoreFocusOut: true, prompt })
    if (value === undefined) throw new Error('Connection cancelled')
    if (persist) await this.vault.store(connName, field, value)
    return value
  }

  private async resolve(cfg: ConnectionConfig, factory: AdapterFactory): Promise<ResolvedConnection> {
    const errs = factory.validate(cfg)
    if (errs.length) throw new Error(`Invalid config for ${cfg.group}/${cfg.name}: ${errs.join(', ')}`)
    const persist = cfg.promptPassword !== true
    const secrets: Record<string, string> = {}
    for (const field of factory.requiredSecrets(cfg)) {
      secrets[field] = await this.getSecret(cfg.name, field, `${field} for ${cfg.group}/${cfg.name}`, persist)
    }
    // config paths (e.g. SQLite `path`) resolve against the .tuplebase.json directory
    const baseDir = this.store.configUri ? dirname(this.store.configUri.fsPath) : undefined
    return { ...cfg, secrets, ...(baseDir ? { baseDir } : {}) }
  }

  // Open the SSH bastion tunnel a connection asks for (if any). Returns the local
  // endpoint the adapter should dial instead of the configured host/port.
  private async openSshTunnel(cfg: ConnectionConfig): Promise<Tunnel | undefined> {
    const ssh = cfg.ssh
    if (!ssh) return undefined
    const secrets: TunnelSecrets = {}
    if (ssh.privateKey) {
      const keyPath = ssh.privateKey.startsWith('~') ? join(homedir(), ssh.privateKey.slice(1)) : ssh.privateKey
      try {
        secrets.privateKey = readFileSync(keyPath)
      } catch (e) {
        throw new Error(`cannot read SSH private key '${ssh.privateKey}': ${(e as Error).message}`)
      }
    }
    if (ssh.passphrase === true) {
      secrets.passphrase = await this.getSecret(cfg.name, 'ssh:passphrase', `SSH key passphrase for ${cfg.group}/${cfg.name}`)
    }
    if (ssh.password === true) {
      secrets.password = await this.getSecret(cfg.name, 'ssh:password', `SSH password for ${cfg.group}/${cfg.name}`)
    }
    const portField = this.modules.get(cfg.adapter)?.presentation.fields.find(f => f.key === 'port')
    const defaultPort = typeof portField?.default === 'number' ? portField.default : 22
    const target = { host: typeof cfg.host === 'string' ? cfg.host : 'localhost', port: Number(cfg.port ?? defaultPort) }
    return openTunnel(ssh, target, secrets)
  }

  // live-only lookup for completion providers — never connects, never prompts
  liveAdapter(connName: string): Adapter | undefined {
    return this.live.get(connName)?.adapter
  }

  isConnected(connName: string): boolean {
    return this.liveAdapter(connName) !== undefined
  }

  connectionState(connName: string): ConnectionState {
    return this.states.get(connName) ?? { status: 'disconnected' }
  }

  private setState(connName: string, status: ConnectionStatus, message?: string): void {
    const previous = this.connectionState(connName)
    if (previous.status === status && previous.message === message) return
    if (status === 'disconnected' && !message) this.states.delete(connName)
    else this.states.set(connName, { status, ...(message ? { message } : {}) })
    this.connEmitter.fire()
  }

  private generation(key: string): number {
    return this.generations.get(key) ?? 0
  }

  private cancelPending(key: string): void {
    this.generations.set(key, this.generation(key) + 1)
    this.pending.delete(key)
  }

  private async close(adapter: Adapter, tunnel?: Tunnel): Promise<void> {
    const results = await Promise.allSettled([
      Promise.resolve().then(() => adapter.dispose()),
      ...(tunnel ? [Promise.resolve().then(() => tunnel.close())] : []),
    ])
    const errors = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map(r => r.reason)
    if (errors.length) throw new AggregateError(errors, 'Failed to close connection resources')
  }

  private takeLive(key: string): LiveConnection | undefined {
    const conn = this.live.get(key)
    if (conn) this.live.delete(key)
    return conn
  }

  async getAdapter(connName: string): Promise<Adapter> {
    const cfg = this.findConfig(connName)
    const key = cfg.name
    const signature = connectionSignature(cfg)
    const existing = this.live.get(key)
    if (existing?.signature === signature) return existing.adapter
    if (existing) await this.disconnect(key)
    const inFlight = this.pending.get(key)
    if (inFlight?.signature === signature && inFlight.generation === this.generation(key)) {
      return inFlight.promise
    }
    if (inFlight) this.cancelPending(key)
    const myEpoch = this.epoch
    const myGeneration = this.generation(key)
    this.setState(key, 'connecting')
    const p = (async () => {
      const factory = await this.factory(cfg.adapter)
      const resolved = await this.resolve(cfg, factory)
      let tunnel: Tunnel | undefined
      let adapter: Adapter | undefined
      try {
        tunnel = await this.openSshTunnel(cfg)
        // route the adapter through the tunnel's local endpoint when there is one
        const effective = tunnel ? { ...resolved, host: tunnel.host, port: tunnel.port } : resolved
        adapter = factory.create(effective)
        await adapter.connect(effective)
        if (this.epoch !== myEpoch || this.generation(key) !== myGeneration) {
          throw new Error('Connection cancelled — disposed while connecting')
        }
        this.live.set(key, { adapter, cfg: effective, signature, ...(tunnel ? { tunnel } : {}) })
        this.setState(key, 'connected')
        return adapter
      } catch (e) {
        if (this.epoch === myEpoch && this.generation(key) === myGeneration) {
          const message = e instanceof Error ? e.message : String(e)
          if (message.startsWith('Connection cancelled')) this.setState(key, 'disconnected')
          else this.setState(key, 'error', message)
        }
        if (adapter || tunnel) {
          try {
            if (adapter) await this.close(adapter, tunnel)
            else await tunnel?.close()
          } catch (cleanupError) {
            throw new AggregateError([e, cleanupError], `${(e as Error).message} (cleanup also failed)`)
          }
        }
        throw e
      }
    })()
    const pending = { generation: myGeneration, signature, promise: p }
    this.pending.set(key, pending)
    this.connecting.add(p)
    try {
      return await p
    } finally {
      this.connecting.delete(p)
      if (this.pending.get(key) === pending) this.pending.delete(key)
    }
  }

  async disconnect(connName: string): Promise<void> {
    const hadPending = this.pending.has(connName)
    this.cancelPending(connName)
    const conn = this.takeLive(connName)
    if (conn || hadPending || this.connectionState(connName).status !== 'disconnected') {
      this.setState(connName, 'disconnected')
    }
    if (!conn) return
    await this.close(conn.adapter, conn.tunnel)
  }

  // Prove the live connections are actually live. Nothing else notices when a
  // server goes away mid-session — the adapter object survives, so the explorer
  // keeps showing a connected dot until an operation happens to fail. The
  // explorer refresh calls this so a dead connection is dropped (and redrawn as
  // disconnected) instead of lying. Re-uses the config it was opened with, so
  // no secret is prompted again.
  async verifyConnection(connName: string): Promise<boolean> {
    const conn = this.live.get(connName)
    if (!conn) return false
    this.setState(connName, 'checking')
    try {
      await conn.adapter.testConnection(conn.cfg)
      if (this.live.get(connName) === conn) this.setState(connName, 'connected')
      return this.live.get(connName) === conn
    } catch (e) {
      if (this.live.get(connName) !== conn) return false
      this.live.delete(connName)
      this.cancelPending(connName)
      const message = e instanceof Error ? e.message : String(e)
      this.setState(connName, 'error', message)
      await this.close(conn.adapter, conn.tunnel)
      return false
    }
  }

  async verifyLive(): Promise<void> {
    const results = await Promise.allSettled([...this.live.keys()].map(key => this.verifyConnection(key)))
    const errors = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map(r => r.reason)
    if (errors.length) throw new AggregateError(errors, 'Failed to clean up dead connections')
  }

  // Reconcile cached resources after ConfigStore publishes a newly parsed file.
  // Removed/renamed connections and driver-affecting edits are closed; group and
  // read-only changes keep the same underlying session.
  async reconcileConfig(): Promise<void> {
    const stale = [...this.live]
      .filter(([key, conn]) => {
        const current = this.store.connection(key)
        return !current || connectionSignature(current) !== conn.signature
      })
      .map(([key]) => key)
    for (const [key, pending] of this.pending) {
      const current = this.store.connection(key)
      if (!current || connectionSignature(current) !== pending.signature) {
        this.cancelPending(key)
        this.setState(key, 'disconnected')
      }
    }
    const results = await Promise.allSettled(stale.map(key => this.disconnect(key)))
    const errors = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map(r => r.reason)
    if (errors.length) throw new AggregateError(errors, 'Failed to reconcile changed connections')
  }

  // Drop this connection's stored secrets (a bad saved password, say) without
  // touching others — the next connect re-prompts. Disconnects first if live.
  async forgetSecrets(connName: string): Promise<void> {
    // A cancelled connect can still be finishing a prompt/SecretStorage write.
    // Wait for it before deleting so it cannot recreate a credential afterward.
    const inFlight = this.pending.get(connName)?.promise
    const errors: unknown[] = []
    try { await this.disconnect(connName) } catch (e) { errors.push(e) }
    await inFlight?.catch(() => undefined)
    try { await this.vault.deleteConnection(connName) } catch (e) { errors.push(e) }
    if (errors.length) throw new AggregateError(errors, `Failed to reset credentials for "${connName}"`)
  }

  async reconnectWithFreshSecret(connName: string): Promise<Adapter> {
    const cfg = this.findConfig(connName)
    await this.forgetSecrets(cfg.name)
    return this.getAdapter(connName)
  }

  async disposeAll() {
    this.epoch++
    this.pending.clear()
    const connecting = [...this.connecting]
    const connections = [...this.live.values()]
    const hadStates = this.states.size > 0
    this.live.clear()
    this.states.clear()
    if (connections.length || hadStates) this.connEmitter.fire()
    const results = await Promise.allSettled([
      ...connections.map(conn => this.close(conn.adapter, conn.tunnel)),
      ...connecting.map(p => p.catch(() => undefined)),
    ])
    const errors = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map(r => r.reason)
    if (errors.length) throw new AggregateError(errors, 'Failed to dispose all connections')
  }

  dispose() {
    // disposeAll fires connEmitter — only dispose it once that finishes
    void this.disposeAll().catch(() => {}).finally(() => this.connEmitter.dispose())
  }
}
