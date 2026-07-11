// Pure spec for the new-connection form: which fields each adapter shows, how to
// validate them, and how to turn form values into a connection object for the
// config. The webview renders from this; unit tests exercise it directly.
export interface Field {
  key: string
  label: string
  kind: 'text' | 'number' | 'checkbox' | 'select'
  required?: boolean
  default?: string | number | boolean
  options?: readonly string[]
}

export const ADAPTERS = ['postgres', 'redis', 'dynamodb'] as const

const SPECS: Record<string, Field[]> = {
  postgres: [
    { key: 'host', label: 'Host', kind: 'text', required: true, default: 'localhost' },
    { key: 'port', label: 'Port', kind: 'number', default: 5432 },
    { key: 'database', label: 'Database', kind: 'text', required: true },
    { key: 'user', label: 'User', kind: 'text', required: true },
    { key: 'sslmode', label: 'SSL mode', kind: 'select', options: ['', 'disable', 'require', 'verify-ca', 'verify-full'] },
    { key: 'sslrootcert', label: 'SSL root cert', kind: 'text' },
  ],
  redis: [
    { key: 'host', label: 'Host', kind: 'text', required: true, default: 'localhost' },
    { key: 'port', label: 'Port', kind: 'number', default: 6379 },
    { key: 'db', label: 'DB', kind: 'number', default: 0 },
    { key: 'tls', label: 'TLS', kind: 'checkbox', default: false },
    { key: 'username', label: 'Username', kind: 'text' },
    { key: 'auth', label: 'Password auth', kind: 'checkbox', default: false },
  ],
  dynamodb: [
    { key: 'region', label: 'Region', kind: 'text', required: true },
    { key: 'profile', label: 'AWS profile', kind: 'text' },
    { key: 'endpoint', label: 'Endpoint', kind: 'text' },
  ],
}

export function fieldsFor(adapter: string): Field[] {
  return SPECS[adapter] ?? []
}

export function validate(adapter: string, name: string, values: Record<string, unknown>): string[] {
  const errors: string[] = []
  const n = name.trim()
  if (!n) errors.push('Connection name is required')
  else if (n === 'readonly') errors.push('Connection name "readonly" is reserved')
  for (const f of fieldsFor(adapter)) {
    if (!f.required) continue
    const v = values[f.key]
    if (v === undefined || v === null || String(v).trim() === '') errors.push(`${f.label} is required`)
  }
  return errors
}

export function buildConnection(adapter: string, values: Record<string, unknown>): Record<string, unknown> {
  const conn: Record<string, unknown> = { adapter }
  for (const f of fieldsFor(adapter)) {
    const v = values[f.key]
    if (f.kind === 'number') {
      if (v === undefined || v === null || v === '') continue
      const num = Number(v)
      if (Number.isFinite(num)) conn[f.key] = num
    } else if (f.kind === 'checkbox') {
      if (v === true) conn[f.key] = true
    } else {
      const s = v === undefined || v === null ? '' : String(v)
      if (s.trim() !== '') conn[f.key] = s
    }
  }
  return conn
}
