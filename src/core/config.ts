import { BRAND } from './brand'
import { parse, ParseError, printParseErrorCode } from 'jsonc-parser'
import type { ConnectionConfig } from '../adapters/types'
import { adapterIds } from '../adapters/registry'

export const KNOWN_ADAPTERS = adapterIds
const SECRET_FIELDS = ['password', 'passwd', 'secret', 'token', 'accesskeyid', 'secretaccesskey']

export interface ConfigError { path: string; message: string }

export interface RowboatConfig {
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
): { config?: RowboatConfig; errors: ConfigError[] } {
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
  const connections: RowboatConfig['connections'] = {}

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
      for (const field of Object.keys(conn)) {
        if (SECRET_FIELDS.includes(field.toLowerCase())) {
          errors.push({ path: `${path}.${field}`, message: `secret field "${field}" not allowed — ${BRAND} keeps secrets out of config (prompted and stored on your machine)` })
          delete conn[field]
        }
      }
      if (typeof conn.adapter !== 'string' || !KNOWN_ADAPTERS.includes(conn.adapter)) {
        errors.push({ path: `${path}.adapter`, message: `unknown adapter "${String(conn.adapter)}" (known: ${KNOWN_ADAPTERS.join(', ')})` })
        continue
      }
      const connReadonly = typeof conn.readonly === 'boolean' ? conn.readonly : undefined
      delete conn.readonly
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
      } as ConnectionConfig
    }
  }

  return { config: { version: 1, groups, connections }, errors }
}
