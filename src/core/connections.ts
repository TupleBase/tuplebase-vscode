import * as vscode from 'vscode'
import type { Adapter, AdapterFactory, ConnectionConfig, ResolvedConnection } from '../adapters/types'
import { adapterFactories } from '../adapters/registry'
import { BRAND } from './brand'
import { ConfigStore } from './configStore'
import { SecretVault } from './secrets'

export class ConnectionManager implements vscode.Disposable {
  readonly factories: Map<string, AdapterFactory> = adapterFactories()
  private live = new Map<string, Adapter>()   // key: connection name (globally unique)
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

  private async resolve(cfg: ConnectionConfig): Promise<ResolvedConnection> {
    const factory = this.factories.get(cfg.adapter)
    if (!factory) throw new Error(`No adapter registered for "${cfg.adapter}"`)
    const errs = factory.validate(cfg)
    if (errs.length) throw new Error(`Invalid config for ${cfg.group}/${cfg.name}: ${errs.join(', ')}`)
    const secrets: Record<string, string> = {}
    for (const field of factory.requiredSecrets(cfg)) {
      let value = await this.vault.get(cfg.name, field)
      if (value === undefined) {
        value = await vscode.window.showInputBox({
          password: true,
          ignoreFocusOut: true,
          prompt: `${field} for ${cfg.group}/${cfg.name}`,
        })
        if (value === undefined) throw new Error('Connection cancelled')
        await this.vault.store(cfg.name, field, value)
      }
      secrets[field] = value
    }
    return { ...cfg, secrets }
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
      const adapter = factory.create(resolved)
      await adapter.connect(resolved)
      if (this.epoch !== myEpoch) {
        // disposeAll ran while we were connecting (shutdown/refresh) — don't resurrect
        await adapter.dispose().catch(() => {})
        throw new Error('Connection cancelled — disposed while connecting')
      }
      this.live.set(key, adapter)
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

  async disconnect(connName: string): Promise<void> {
    const adapter = this.live.get(connName)
    if (adapter) await adapter.dispose().catch(() => {})
    if (this.live.delete(connName)) this.connEmitter.fire()
  }

  async reconnectWithFreshSecret(connName: string): Promise<Adapter> {
    const cfg = this.findConfig(connName)
    await this.live.get(cfg.name)?.dispose()
    if (this.live.delete(cfg.name)) this.connEmitter.fire()
    await this.vault.deleteConnection(cfg.name)
    return this.getAdapter(connName)
  }

  async disposeAll() {
    this.epoch++
    const hadLive = this.live.size > 0
    for (const a of this.live.values()) await a.dispose().catch(() => {})
    this.live.clear()
    if (hadLive) this.connEmitter.fire()
  }

  dispose() {
    // disposeAll fires connEmitter — only dispose it once that finishes
    void this.disposeAll().finally(() => this.connEmitter.dispose())
  }
}
