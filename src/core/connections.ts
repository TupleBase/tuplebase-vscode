import * as vscode from 'vscode'
import type { Adapter, AdapterFactory, ConnectionConfig, ResolvedConnection } from '../adapters/types'
import { postgresFactory } from '../adapters/postgres'
import { redisFactory } from '../adapters/redis'
import { ConfigStore } from './configStore'
import { SecretVault } from './secrets'

const ACTIVE_ENV_KEY = 'rowboat.activeEnv'

export class ConnectionManager implements vscode.Disposable {
  readonly factories = new Map<string, AdapterFactory>([
    [postgresFactory.id, postgresFactory],
    [redisFactory.id, redisFactory],
  ])
  private live = new Map<string, Adapter>()   // key: `${env}/${conn}`
  private pending = new Map<string, Promise<Adapter>>()
  private envEmitter = new vscode.EventEmitter<string>()
  readonly onDidChangeEnvironment = this.envEmitter.event

  constructor(
    private store: ConfigStore,
    private vault: SecretVault,
    private workspaceState: vscode.Memento,
  ) {}

  get activeEnvironment(): string | undefined {
    const names = this.store.environmentNames()
    const saved = this.workspaceState.get<string>(ACTIVE_ENV_KEY)
    if (saved && names.includes(saved)) return saved
    const def = this.store.config?.defaultEnvironment
    if (def && names.includes(def)) return def
    return names[0]
  }

  async setActiveEnvironment(env: string) {
    await this.disposeAll()
    await this.workspaceState.update(ACTIVE_ENV_KEY, env)
    this.envEmitter.fire(env)
  }

  private findConfig(connName: string): ConnectionConfig {
    const env = this.activeEnvironment
    if (!env) throw new Error('No Rowboat environment configured (.rowboat.json)')
    const cfg = this.store.connections(env).find(c => c.name === connName)
    if (!cfg) throw new Error(`Connection "${connName}" not found in environment "${env}"`)
    return cfg
  }

  private async resolve(cfg: ConnectionConfig): Promise<ResolvedConnection> {
    const factory = this.factories.get(cfg.adapter)
    if (!factory) throw new Error(`No adapter registered for "${cfg.adapter}"`)
    const errs = factory.validate(cfg)
    if (errs.length) throw new Error(`Invalid config for ${cfg.env}/${cfg.name}: ${errs.join(', ')}`)
    const secrets: Record<string, string> = {}
    for (const field of factory.requiredSecrets(cfg)) {
      let value = await this.vault.get(cfg.env, cfg.name, field)
      if (value === undefined) {
        value = await vscode.window.showInputBox({
          password: true,
          ignoreFocusOut: true,
          prompt: `${field} for ${cfg.env}/${cfg.name}`,
        })
        if (value === undefined) throw new Error('Connection cancelled')
        await this.vault.store(cfg.env, cfg.name, field, value)
      }
      secrets[field] = value
    }
    return { ...cfg, secrets }
  }

  async getAdapter(connName: string): Promise<Adapter> {
    const cfg = this.findConfig(connName)
    const key = `${cfg.env}/${cfg.name}`
    const existing = this.live.get(key)
    if (existing) return existing
    const inFlight = this.pending.get(key)
    if (inFlight) return inFlight
    const p = (async () => {
      const factory = this.factories.get(cfg.adapter)!
      const resolved = await this.resolve(cfg)
      const adapter = factory.create(resolved)
      await adapter.connect(resolved)
      this.live.set(key, adapter)
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
    const cfg = this.findConfig(connName)
    const key = `${cfg.env}/${cfg.name}`
    const adapter = this.live.get(key)
    if (adapter) await adapter.dispose().catch(() => {})
    this.live.delete(key)
  }

  async reconnectWithFreshSecret(connName: string): Promise<Adapter> {
    const cfg = this.findConfig(connName)
    const key = `${cfg.env}/${cfg.name}`
    await this.live.get(key)?.dispose()
    this.live.delete(key)
    await this.vault.deleteConnection(cfg.env, cfg.name)
    return this.getAdapter(connName)
  }

  async disposeAll() {
    for (const a of this.live.values()) await a.dispose().catch(() => {})
    this.live.clear()
  }

  dispose() {
    void this.disposeAll()
    this.envEmitter.dispose()
  }
}
