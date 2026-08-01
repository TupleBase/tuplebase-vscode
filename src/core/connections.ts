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
  tunnel?: Tunnel   // SSH bastion backing it, when the config asks for one
}

export class ConnectionManager implements vscode.Disposable {
  private readonly live = new Map<string, LiveConnection>()   // key: connection name (globally unique)
  private readonly pending = new Map<string, Promise<Adapter>>()
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

  async getAdapter(connName: string): Promise<Adapter> {
    const cfg = this.findConfig(connName)
    const key = cfg.name
    const existing = this.live.get(key)
    if (existing) return existing.adapter
    const inFlight = this.pending.get(key)
    if (inFlight) return inFlight
    const myEpoch = this.epoch
    const p = (async () => {
      const factory = await this.factory(cfg.adapter)
      const resolved = await this.resolve(cfg, factory)
      const tunnel = await this.openSshTunnel(cfg)
      // route the adapter through the tunnel's local endpoint when there is one
      const effective = tunnel ? { ...resolved, host: tunnel.host, port: tunnel.port } : resolved
      const adapter = factory.create(effective)
      try {
        await adapter.connect(effective)
      } catch (e) {
        await tunnel?.close().catch(() => {})
        throw e
      }
      if (this.epoch !== myEpoch) {
        // disposeAll ran while we were connecting (shutdown/refresh) — don't resurrect
        await adapter.dispose().catch(() => {})
        await tunnel?.close().catch(() => {})
        throw new Error('Connection cancelled — disposed while connecting')
      }
      this.live.set(key, { adapter, cfg: effective, ...(tunnel ? { tunnel } : {}) })
      this.connEmitter.fire()
      return adapter
    })()
    this.pending.set(key, p)
    try {
      return await p
    } finally {
      this.pending.delete(key)
    }
  }

  // Close a connection's adapter and tunnel. Shutdown paths call it directly;
  // drop() also forgets the entry. Neither fires — callers decide when to notify.
  private async close(conn: LiveConnection): Promise<void> {
    await conn.adapter.dispose().catch(() => {})
    await conn.tunnel?.close().catch(() => {})
  }

  private async drop(key: string): Promise<boolean> {
    const conn = this.live.get(key)
    if (!conn) return false
    await this.close(conn)
    return this.live.delete(key)
  }

  async disconnect(connName: string): Promise<void> {
    if (await this.drop(connName)) this.connEmitter.fire()
  }

  // Prove the live connections are actually live. Nothing else notices when a
  // server goes away mid-session — the adapter object survives, so the explorer
  // keeps showing a connected dot until an operation happens to fail. The
  // explorer refresh calls this so a dead connection is dropped (and redrawn as
  // disconnected) instead of lying. Re-uses the config it was opened with, so
  // no secret is prompted again.
  async verifyLive(): Promise<void> {
    const checks = [...this.live].map(async ([key, conn]) => {
      try {
        await conn.adapter.testConnection(conn.cfg)
        return false
      } catch {
        return this.drop(key)
      }
    })
    if ((await Promise.all(checks)).some(Boolean)) this.connEmitter.fire()
  }

  // Drop this connection's stored secrets (a bad saved password, say) without
  // touching others — the next connect re-prompts. Disconnects first if live.
  async forgetSecrets(connName: string): Promise<void> {
    await this.disconnect(connName)
    await this.vault.deleteConnection(connName)
  }

  async reconnectWithFreshSecret(connName: string): Promise<Adapter> {
    const cfg = this.findConfig(connName)
    if (await this.drop(cfg.name)) this.connEmitter.fire()
    await this.vault.deleteConnection(cfg.name)
    return this.getAdapter(connName)
  }

  async disposeAll() {
    this.epoch++
    const hadLive = this.live.size > 0
    for (const conn of this.live.values()) await this.close(conn)
    this.live.clear()
    if (hadLive) this.connEmitter.fire()
  }

  dispose() {
    // disposeAll fires connEmitter — only dispose it once that finishes
    void this.disposeAll().finally(() => this.connEmitter.dispose())
  }
}
