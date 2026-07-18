import { BRAND } from './product'
import { parse, ParseError, printParseErrorCode } from 'jsonc-parser'
import type { ConnectionConfig, SshConfig } from '../adapters/types'
import { adapterIds, adapterById } from '../adapters/registry'

const SSH_KEYS = new Set(['host', 'port', 'user', 'privateKey', 'passphrase', 'password'])

// Validate + interpolate a connection's optional `ssh` bastion block. Paths and
// names are config; the passphrase / password are booleans here (prompted and
// keychained at connect), never secret strings in the file.
function parseSsh(
  raw: unknown,
  adapter: string,
  path: string,
  env: Record<string, string | undefined>,
  errors: ConfigError[],
): SshConfig | undefined {
  if (raw === undefined) return undefined
  const at = `${path}.ssh`
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    errors.push({ path: at, message: 'ssh must be an object' })
    return undefined
  }
  const supportsHost = adapterById.get(adapter)?.presentation.fields.some(f => f.key === 'host')
  if (!supportsHost) {
    errors.push({ path: at, message: `ssh tunnelling is not supported for adapter "${adapter}"` })
    return undefined
  }
  const o = raw as Record<string, unknown>
  for (const k of Object.keys(o)) {
    if (!SSH_KEYS.has(k)) errors.push({ path: `${at}.${k}`, message: `unknown ssh field "${k}"` })
  }
  const str = (k: 'host' | 'user' | 'privateKey', required: boolean): string | undefined => {
    const v = o[k]
    if (v === undefined || v === '') {
      if (required) errors.push({ path: `${at}.${k}`, message: `ssh.${k} is required` })
      return undefined
    }
    if (typeof v !== 'string') {
      errors.push({ path: `${at}.${k}`, message: `ssh.${k} must be a string` })
      return undefined
    }
    try { return interpolate(v, env) } catch (e) { errors.push({ path: `${at}.${k}`, message: (e as Error).message }); return undefined }
  }
  const bool = (k: 'passphrase' | 'password'): boolean | undefined => {
    const v = o[k]
    if (v === undefined) return undefined
    if (typeof v !== 'boolean') {
      errors.push({ path: `${at}.${k}`, message: `ssh.${k} must be true/false — ${BRAND} prompts for the secret and stores it in your keychain` })
      return undefined
    }
    return v
  }
  const host = str('host', true)
  const user = str('user', true)
  const privateKey = str('privateKey', false)
  const passphrase = bool('passphrase')
  const password = bool('password')
  let port: number | undefined
  if (o.port !== undefined) {
    if (typeof o.port !== 'number') errors.push({ path: `${at}.port`, message: 'ssh.port must be a number' })
    else port = o.port
  }
  if (privateKey === undefined && password !== true) {
    errors.push({ path: at, message: 'ssh needs a privateKey path or "password": true' })
  }
  if (host === undefined || user === undefined) return undefined
  return {
    host, user,
    ...(port !== undefined ? { port } : {}),
    ...(privateKey ? { privateKey } : {}),
    ...(passphrase !== undefined ? { passphrase } : {}),
    ...(password !== undefined ? { password } : {}),
  }
}
const SECRET_FIELDS = ['password', 'passwd', 'secret', 'token', 'accesskeyid', 'secretaccesskey']

export interface ConfigError { path: string; message: string }

export interface TupleBaseConfig {
  version: number
  groups: string[]
  connections: Record<string, ConnectionConfig>
}

const VAR_RE = /\$\{env:([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g

export function interpolate(value: string, env: Record<string, string | undefined>): string {
  return value.replace(VAR_RE, (_m, name: string, def: string | undefined) => {
    const v = env[name]
    if (v !== undefined) return v
    if (def !== undefined) return def
    throw new Error(`Missing environment variable: ${name}`)
  })
}

export function parseConfig(
  text: string,
  env: Record<string, string | undefined> = process.env,
): { config?: TupleBaseConfig; errors: ConfigError[] } {
  const parseErrors: ParseError[] = []
  const raw = parse(text, parseErrors, { allowTrailingComma: true })
  if (parseErrors.length > 0) {
    return { errors: parseErrors.map(e => ({ path: '', message: printParseErrorCode(e.error) })) }
  }
  if (typeof raw !== 'object' || raw === null) {
    return { errors: [{ path: '', message: 'config must be an object' }] }
  }
  if (raw.version !== 1) {
    return { errors: [{ path: 'version', message: 'requires "version": 1' }] }
  }
  if (typeof raw.groups !== 'object' || raw.groups === null) {
    return { errors: [{ path: 'groups', message: 'missing "groups" object' }] }
  }

  const errors: ConfigError[] = []
  const groups: string[] = []
  const connections: TupleBaseConfig['connections'] = {}

  for (const [groupName, groupRaw] of Object.entries(raw.groups as Record<string, unknown>)) {
    groups.push(groupName)
    if (typeof groupRaw !== 'object' || groupRaw === null) {
      errors.push({ path: `groups.${groupName}`, message: 'must be an object of connections' })
      continue
    }
    const entries = Object.entries(groupRaw as Record<string, unknown>)
    const groupReadonly = entries.find(([k]) => k === 'readonly')?.[1]
    if (groupReadonly !== undefined && typeof groupReadonly !== 'boolean') {
      errors.push({ path: `groups.${groupName}.readonly`, message: 'must be a boolean' })
    }
    for (const [connName, connRaw] of entries) {
      if (connName === 'readonly') continue
      const path = `groups.${groupName}.${connName}`
      if (connections[connName]) {
        errors.push({ path, message: `duplicate connection name "${connName}" (names must be unique across groups)` })
        continue
      }
      if (typeof connRaw !== 'object' || connRaw === null) {
        errors.push({ path, message: 'connection must be an object' })
        continue
      }
      const conn = { ...(connRaw as Record<string, unknown>) }
      // Not an enabled adapter (disabled for this release, or unknown): skip the
      // entry entirely — configs written for other versions load without errors.
      // Skipped entries get no diagnostics at all — not even the secret-field scrub.
      if (typeof conn.adapter !== 'string' || !adapterIds.includes(conn.adapter)) continue
      for (const field of Object.keys(conn)) {
        if (SECRET_FIELDS.includes(field.toLowerCase())) {
          errors.push({ path: `${path}.${field}`, message: `secret field "${field}" not allowed — ${BRAND} keeps secrets out of config (prompted and stored on your machine)` })
          delete conn[field]
        }
      }
      const connReadonly = typeof conn.readonly === 'boolean' ? conn.readonly : undefined
      delete conn.readonly
      const sshRaw = conn.ssh
      delete conn.ssh
      const ssh = parseSsh(sshRaw, conn.adapter as string, path, env, errors)
      if (conn.promptPassword !== undefined && typeof conn.promptPassword !== 'boolean') {
        errors.push({ path: `${path}.promptPassword`, message: 'promptPassword must be a boolean' })
        delete conn.promptPassword
      }
      for (const [k, v] of Object.entries(conn)) {
        if (typeof v === 'string') {
          try {
            conn[k] = interpolate(v, env)
          } catch (e) {
            errors.push({ path: `${path}.${k}`, message: (e as Error).message })
          }
        }
      }
      connections[connName] = {
        ...conn,
        group: groupName,
        name: connName,
        adapter: conn.adapter as string,
        readonly: connReadonly ?? groupReadonly === true,
        ...(ssh ? { ssh } : {}),
      } as ConnectionConfig
    }
  }

  return { config: { version: 1, groups, connections }, errors }
}
