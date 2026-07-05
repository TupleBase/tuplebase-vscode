import { parse, ParseError, printParseErrorCode } from 'jsonc-parser'
import type { ConnectionConfig } from '../adapters/types'

export const KNOWN_ADAPTERS = ['postgres', 'redis', 'dynamodb']
const SECRET_FIELDS = ['password', 'passwd', 'secret', 'token', 'accesskeyid', 'secretaccesskey']

export interface ConfigError { path: string; message: string }

export interface RowboatConfig {
  defaultEnvironment?: string
  environments: Record<string, Record<string, ConnectionConfig>>
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
  env: Record<string, string | undefined> = process.env
): { config?: RowboatConfig; errors: ConfigError[] } {
  const parseErrors: ParseError[] = []
  const raw = parse(text, parseErrors, { allowTrailingComma: true })
  if (parseErrors.length > 0) {
    return {
      errors: parseErrors.map(e => ({ path: '', message: printParseErrorCode(e.error) })),
    }
  }
  const errors: ConfigError[] = []
  if (typeof raw !== 'object' || raw === null || typeof raw.environments !== 'object' || raw.environments === null) {
    return { errors: [{ path: 'environments', message: 'missing "environments" object' }] }
  }

  const environments: RowboatConfig['environments'] = {}
  for (const [envName, conns] of Object.entries(raw.environments as Record<string, unknown>)) {
    environments[envName] = {}
    if (typeof conns !== 'object' || conns === null) {
      errors.push({ path: `environments.${envName}`, message: 'must be an object of connections' })
      continue
    }
    for (const [connName, connRaw] of Object.entries(conns as Record<string, unknown>)) {
      const path = `environments.${envName}.${connName}`
      if (typeof connRaw !== 'object' || connRaw === null) {
        errors.push({ path, message: 'connection must be an object' })
        continue
      }
      const conn = { ...(connRaw as Record<string, unknown>) }
      for (const field of Object.keys(conn)) {
        if (SECRET_FIELDS.includes(field.toLowerCase())) {
          errors.push({ path: `${path}.${field}`, message: `secret field "${field}" not allowed — Rowboat keeps secrets out of config (prompted and stored on your machine)` })
          delete conn[field]
        }
      }
      if (typeof conn.adapter !== 'string' || !KNOWN_ADAPTERS.includes(conn.adapter)) {
        errors.push({ path: `${path}.adapter`, message: `unknown adapter "${String(conn.adapter)}" (known: ${KNOWN_ADAPTERS.join(', ')})` })
        continue
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
      environments[envName][connName] = { ...conn, env: envName, name: connName, adapter: conn.adapter as string } as ConnectionConfig
    }
  }
  return {
    config: { defaultEnvironment: raw.defaultEnvironment, environments },
    errors,
  }
}
