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

// encodeURIComponent leaves '.' untouched, so strip it explicitly to keep
// segments dot-free (dots are the key separator; user-supplied env/conn/field
// names must not be able to forge one).
function esc(s: string): string {
  return encodeURIComponent(s).replace(/\./g, '%2E')
}

export class SecretVault {
  constructor(private backend: SecretBackend, private state: KeyIndex) {}

  // ponytail: promise-chain mutex, serializes index read-modify-write across
  // concurrent calls; swap for a real lock if this ever needs cross-process safety
  private lock: Promise<unknown> = Promise.resolve()
  private withLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.lock.then(fn)
    this.lock = run.catch(() => undefined)
    return run
  }

  static key(env: string, conn: string, field: string): string {
    return `rowboat.${esc(env)}.${esc(conn)}.${esc(field)}`
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
    return this.withLock(async () => {
      const idx = this.index()
      if (!idx.includes(key)) await this.state.update(INDEX_KEY, [...idx, key])
    })
  }

  async deleteConnection(env: string, conn: string) {
    const prefix = `rowboat.${esc(env)}.${esc(conn)}.`
    return this.withLock(async () => {
      const idx = this.index()
      const doomed = idx.filter(k => k.startsWith(prefix))
      for (const k of doomed) await this.backend.delete(k)
      await this.state.update(INDEX_KEY, idx.filter(k => !k.startsWith(prefix)))
    })
  }

  async clearAll(): Promise<string[]> {
    return this.withLock(async () => {
      const idx = this.index()
      for (const k of idx) await this.backend.delete(k)
      await this.state.update(INDEX_KEY, [])
      return idx
    })
  }
}
