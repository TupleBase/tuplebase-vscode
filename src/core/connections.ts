import * as vscode from 'vscode'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Adapter, AdapterFactory, ConnectionConfig, ResolvedConnection } from '../adapters/types'
import { adapterById, adapterFactories } from '../adapters/registry'
import { ConfigStore } from './configStore'
import { SecretVault } from './secrets'
import { openTunnel, type Tunnel, type TunnelSecrets } from './sshTunnel'

export class ConnectionManager implements vscode.Disposable {
  readonly factories: Map<string, AdapterFactory> = adapterFactories()
  private live = new Map<string, Adapter>()   // key: connection name (globally unique)
  private tunnels = new Map<string, Tunnel>() // SSH tunnel backing a live connection, same key
  private pending = new Map<string, Promise<Adapter>>()
  private epoch = 0   // bumped by disposeAll so in-flight connects know not to land
  private connEmitter = new vscode.EventEmitter<void>()
  readonly onDidChangeConnections = this.connEmitter.event

  constructor(
    private store: ConfigStore,
    private vault: SecretVault,
  ) {}

  private findConfig(name: string): ConnectionConfig {
    const cfg = this.store.connection(name)
    if (!cfg) throw new Error(`Connection "${name}" not found (.rowboat.json)`)
    return cfg
  }

  // Fetch a secret from the keychain, prompting (and storing) on first use.
  private async getSecret(connName: string, field: string, prompt: string): Promise<string> {
    let value = await this.vault.get(connName, field)
    if (value === undefined) {
      value = await vscode.window.showInputBox({ password: true, ignoreFocusOut: true, prompt })
      if (value === undefined) throw new Error('Connection cancelled')
      await this.vault.store(connName, field, value)
    }
    return value
  }

  private async resolve(cfg: ConnectionConfig): Promise<ResolvedConnection> {
    const factory = this.factories.get(cfg.adapter)
    if (!factory) throw new Error(`No adapter registered for "${cfg.adapter}"`)
    const errs = factory.validate(cfg)
    if (errs.length) throw new Error(`Invalid config for ${cfg.group}/${cfg.name}: ${errs.join(', ')}`)
    const secrets: Record<string, string> = {}
    for (const field of factory.requiredSecrets(cfg)) {
      secrets[field] = await this.getSecret(cfg.name, field, `${field} for ${cfg.group}/${cfg.name}`)
    }
    return { ...cfg, secrets }
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
    const portField = adapterById.get(cfg.adapter)?.presentation.fields.find(f => f.key === 'port')
    const defaultPort = typeof portField?.default === 'number' ? portField.default : 22
    const target = { host: typeof cfg.host === 'string' ? cfg.host : 'localhost', port: Number(cfg.port ?? defaultPort) }
    return openTunnel(ssh, target, secrets)
  }

  // live-only lookup for completion providers — never connects, never prompts
  liveAdapter(connName: string): Adapter | undefined {
    return this.live.get(connName)
  }

  isConnected(connName: string): boolean {
    return this.liveAdapter(connName) !== undefined
  }

  async getAdapter(connName: string): Promise<Adapter> {
    const cfg = this.findConfig(connName)
    const key = cfg.name
    const existing = this.live.get(key)
    if (existing) return existing
    const inFlight = this.pending.get(key)
    if (inFlight) return inFlight
    const myEpoch = this.epoch
    const p = (async () => {
      const factory = this.factories.get(cfg.adapter)!
      const resolved = await this.resolve(cfg)
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
      this.live.set(key, adapter)
      if (tunnel) this.tunnels.set(key, tunnel)
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

  private async closeTunnel(key: string): Promise<void> {
    await this.tunnels.get(key)?.close().catch(() => {})
    this.tunnels.delete(key)
  }

  async disconnect(connName: string): Promise<void> {
    const adapter = this.live.get(connName)
    if (adapter) await adapter.dispose().catch(() => {})
    await this.closeTunnel(connName)
    if (this.live.delete(connName)) this.connEmitter.fire()
  }

  // Drop this connection's stored secrets (a bad saved password, say) without
  // touching others — the next connect re-prompts. Disconnects first if live.
  async forgetSecrets(connName: string): Promise<void> {
    await this.disconnect(connName)
    await this.vault.deleteConnection(connName)
  }

  async reconnectWithFreshSecret(connName: string): Promise<Adapter> {
    const cfg = this.findConfig(connName)
    await this.live.get(cfg.name)?.dispose()
    await this.closeTunnel(cfg.name)
    if (this.live.delete(cfg.name)) this.connEmitter.fire()
    await this.vault.deleteConnection(cfg.name)
    return this.getAdapter(connName)
  }

  async disposeAll() {
    this.epoch++
    const hadLive = this.live.size > 0
    for (const a of this.live.values()) await a.dispose().catch(() => {})
    for (const t of this.tunnels.values()) await t.close().catch(() => {})
    this.live.clear()
    this.tunnels.clear()
    if (hadLive) this.connEmitter.fire()
  }

  dispose() {
    // disposeAll fires connEmitter — only dispose it once that finishes
    void this.disposeAll().finally(() => this.connEmitter.dispose())
  }
}
