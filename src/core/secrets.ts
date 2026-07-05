export interface SecretBackend {
  get(key: string): Thenable<string | undefined>
  store(key: string, value: string): Thenable<void>
  delete(key: string): Thenable<void>
}

export interface KeyIndex {
  get<T>(key: string, defaultValue: T): T
  update(key: string, value: unknown): Thenable<void>
}

const INDEX_KEY = 'rowboat.secretKeys'

export class SecretVault {
  constructor(private backend: SecretBackend, private state: KeyIndex) {}

  static key(env: string, conn: string, field: string): string {
    return `rowboat.${env}.${conn}.${field}`
  }

  private index(): string[] {
    return this.state.get<string[]>(INDEX_KEY, [])
  }

  async get(env: string, conn: string, field: string) {
    return this.backend.get(SecretVault.key(env, conn, field))
  }

  async store(env: string, conn: string, field: string, value: string) {
    const key = SecretVault.key(env, conn, field)
    await this.backend.store(key, value)
    const idx = this.index()
    if (!idx.includes(key)) await this.state.update(INDEX_KEY, [...idx, key])
  }

  async deleteConnection(env: string, conn: string) {
    const prefix = `rowboat.${env}.${conn}.`
    const idx = this.index()
    const doomed = idx.filter(k => k.startsWith(prefix))
    for (const k of doomed) await this.backend.delete(k)
    await this.state.update(INDEX_KEY, idx.filter(k => !k.startsWith(prefix)))
  }

  async clearAll(): Promise<string[]> {
    const idx = this.index()
    for (const k of idx) await this.backend.delete(k)
    await this.state.update(INDEX_KEY, [])
    return idx
  }
}
