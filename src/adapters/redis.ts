import type {
  Adapter, AdapterFactory, ExecuteOptions,
  ItemKind, ResolvedConnection, ResultEnvelope, SchemaItem, TreeNode,
} from './types'
import type { RedisClientType } from '@redis/client'
import { splitRedisCommands } from '../core/statements'

const NS_PREFIX = 'redis:ns:'
const KEY_PREFIX = 'redis:key:'
const KEY_SCAN_CAP = 10_000
const TYPE_LOOKUP_MAX = 200

// redis-cli style argument splitting: double quotes unescape (\n, \xhh, …),
// single quotes are literal except \'
export function tokenizeRedisCommand(line: string): string[] {
  const args: string[] = []
  const escapes: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', a: '\x07' }
  let i = 0
  while (i < line.length) {
    while (i < line.length && /\s/.test(line[i])) i++
    if (i >= line.length) break
    let arg = ''
    const quote = line[i] === '"' || line[i] === "'" ? line[i] : undefined
    if (quote) {
      i++
      let closed = false
      while (i < line.length) {
        const ch = line[i]
        if (quote === '"' && ch === '\\') {
          const next = line[i + 1]
          const hex = next === 'x' ? /^[0-9a-fA-F]{2}/.exec(line.slice(i + 2))?.[0] : undefined
          if (hex) { arg += String.fromCharCode(parseInt(hex, 16)); i += 4; continue }
          arg += escapes[next] ?? next ?? '\\'
          i += 2
          continue
        }
        if (quote === "'" && ch === '\\' && line[i + 1] === "'") { arg += "'"; i += 2; continue }
        if (ch === quote) { closed = true; i++; break }
        arg += ch
        i++
      }
      if (!closed) throw new Error(`unbalanced ${quote === '"' ? 'double' : 'single'} quote`)
      if (i < line.length && !/\s/.test(line[i])) throw new Error('expected space after closing quote')
    } else {
      while (i < line.length && !/\s/.test(line[i])) { arg += line[i]; i++ }
    }
    args.push(arg)
  }
  return args
}

const scalarize = (v: unknown): unknown =>
  v === null || typeof v !== 'object' ? v : JSON.stringify(v)

export function replyToEnvelope(reply: unknown, elapsedMs: number, pageSize: number): ResultEnvelope {
  const envelope = (names: string[], all: unknown[][], warnings: string[] = []): ResultEnvelope => {
    const rows = all.slice(0, pageSize)
    if (all.length > pageSize) warnings = [...warnings, `showing first ${pageSize} of ${all.length} rows`]
    return { columns: names.map(name => ({ name })), rows, rowCount: all.length, elapsedMs, warnings }
  }
  if (reply === null) return envelope(['value'], [], ['(nil)'])
  if (Array.isArray(reply)) return envelope(['#', 'value'], reply.map((v, idx) => [idx + 1, scalarize(v)]))
  if (typeof reply === 'object') {
    return envelope(['field', 'value'], Object.entries(reply).map(([f, v]) => [f, scalarize(v)]))
  }
  return envelope(['value'], [[scalarize(reply)]])
}

// one tree level under `prefix` ('' = root, otherwise ends with ':')
export function groupKeys(keys: string[], prefix: string): {
  namespaces: Array<{ segment: string; count: number }>
  leaves: string[]
} {
  const counts = new Map<string, number>()
  const leaves: string[] = []
  for (const key of keys) {
    if (!key.startsWith(prefix)) continue
    const rest = key.slice(prefix.length)
    const sep = rest.indexOf(':')
    if (sep === -1) leaves.push(key)
    else counts.set(rest.slice(0, sep), (counts.get(rest.slice(0, sep)) ?? 0) + 1)
  }
  return {
    namespaces: [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([segment, count]) => ({ segment, count })),
    leaves: leaves.sort(),
  }
}

class RedisAdapter implements Adapter {
  readonly id = 'redis'
  private client: RedisClientType | undefined
  private keys: string[] = []
  private capped = false

  constructor(private cfg: ResolvedConnection) {}

  private async getClient(): Promise<RedisClientType> {
    if (!this.client) {
      const { createClient } = await import('@redis/client')   // lazy: driver loads on first connect
      const client = createClient({
        socket: {
          host: String(this.cfg.host),
          port: Number(this.cfg.port ?? 6379),
          connectTimeout: 8000,
          // don't retry a dead server forever in the background
          reconnectStrategy: retries => (retries >= 3 ? false : Math.min(retries * 200, 1000)),
          ...(this.cfg.tls === true ? { tls: true as const } : {}),
        },
        ...(typeof this.cfg.username === 'string' && this.cfg.username !== ''
          ? { username: this.cfg.username } : {}),
        ...(this.cfg.secrets.password !== undefined ? { password: this.cfg.secrets.password } : {}),
        database: Number(this.cfg.db ?? 0),
      }) as RedisClientType
      // errors surface through command/connect rejections; without a listener
      // node-redis re-throws socket errors as uncaught
      client.on('error', () => {})
      await client.connect()
      this.client = client
    }
    return this.client
  }

  async connect(cfg: ResolvedConnection) {
    this.cfg = cfg
    await this.testConnection(cfg)
  }

  async testConnection(_cfg: ResolvedConnection) {
    const client = await this.getClient()
    await client.sendCommand(['PING'])
  }

  async execute(stmt: string, opts: ExecuteOptions): Promise<ResultEnvelope> {
    const commands = splitRedisCommands(stmt)
    if (commands.length === 0) throw new Error('no redis command in input')
    if (commands.length > 1) {
      throw new Error('one redis command per run — select a single line (run-whole-file lands in Plan 04)')
    }
    const args = tokenizeRedisCommand(commands[0].text)
    const client = await this.getClient()
    const started = Date.now()
    // ponytail: no mid-command cancel — redis has no per-command cancellation
    // and replies are near-instant; the run pipeline discards stale results
    const reply = await client.sendCommand(args)
    return replyToEnvelope(reply, Date.now() - started, opts.pageSize)
  }

  private async scanKeys(client: RedisClientType): Promise<void> {
    const found = new Set<string>()
    let cursor = '0'
    do {
      const [next, batch] = await client.sendCommand<[string, string[]]>(['SCAN', cursor, 'COUNT', '1000'])
      for (const k of batch) found.add(k)
      cursor = next
    } while (cursor !== '0' && found.size < KEY_SCAN_CAP)
    this.capped = cursor !== '0'
    this.keys = [...found]
  }

  async getChildren(node: TreeNode | null): Promise<TreeNode[]> {
    const client = await this.getClient()
    if (node === null) await this.scanKeys(client)
    else if (node.kind !== 'namespace') return []
    const prefix = node === null ? '' : node.id.slice(NS_PREFIX.length)
    const { namespaces, leaves } = groupKeys(this.keys, prefix)

    const types = leaves.length <= TYPE_LOOKUP_MAX
      ? await Promise.all(leaves.map(k => client.sendCommand<string>(['TYPE', k])))   // auto-pipelined
      : leaves.map(() => undefined)

    const out: TreeNode[] = namespaces.map(ns => ({
      id: `${NS_PREFIX}${prefix}${ns.segment}:`,
      label: ns.segment,
      kind: 'namespace',
      hasChildren: true,
      detail: `${ns.count} key${ns.count === 1 ? '' : 's'}`,
    }))
    out.push(...leaves.map((key, idx) => ({
      id: `${KEY_PREFIX}${key}`,
      label: key.slice(prefix.length) || key,
      kind: 'key',
      hasChildren: false,
      detail: types[idx],
    })))
    if (node === null && this.capped) {
      out.push({
        id: 'redis:info:capped', kind: 'info', hasChildren: false,
        label: `showing first ${KEY_SCAN_CAP} keys`,
      })
    }
    return out
  }

  async searchItems(kind: ItemKind, prefix: string): Promise<SchemaItem[]> {
    if (kind !== 'key') return []
    const client = await this.getClient()
    const pattern = prefix.replace(/[\\*?[\]]/g, m => `\\${m}`) + '*'
    const found = new Set<string>()
    let cursor = '0'
    let rounds = 0
    do {
      const [next, batch] = await client.sendCommand<[string, string[]]>(
        ['SCAN', cursor, 'MATCH', pattern, 'COUNT', '500'],
      )
      for (const k of batch) found.add(k)
      cursor = next
    } while (cursor !== '0' && found.size < 100 && ++rounds < 50)
    return [...found].sort().slice(0, 100).map(name => ({ kind: 'key' as const, name }))
  }

  async dispose() {
    if (this.client) await this.client.close().catch(() => {})
    this.client = undefined
  }
}

export const redisFactory: AdapterFactory = {
  id: 'redis',
  languageId: 'redis',
  validate(raw) {
    return typeof raw.host === 'string' && raw.host !== '' ? [] : ['host is required']
  },
  requiredSecrets(cfg) {
    return cfg.auth === true ? ['password'] : []
  },
  create(cfg) {
    return new RedisAdapter(cfg)
  },
}
