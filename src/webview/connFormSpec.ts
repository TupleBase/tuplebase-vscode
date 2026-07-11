// Pure operations over a connection form's field list: append the shared
// read-only toggle, validate submitted values, and turn them into a config
// object. Field lists come from each adapter's descriptor (host) or the webview
// init payload (browser) — this module never imports the adapter registry, so
// it is safe in both the node host and the browser bundle.
import type { Field } from '../adapters/types'

// Common to every adapter: block writes on this connection (Plan 04 guardrail).
export const READONLY: Field = {
  key: 'readonly', label: 'Read-only', kind: 'checkbox', default: false,
  description: 'Block write statements on this connection (overrides the group default)',
}

// adapter-specific fields plus the shared read-only toggle, in form order
export function withReadonly(fields: Field[]): Field[] {
  return [...fields, READONLY]
}

export function validate(fields: Field[], name: string, values: Record<string, unknown>): string[] {
  const errors: string[] = []
  const n = name.trim()
  if (!n) errors.push('Connection name is required')
  else if (n === 'readonly') errors.push('Connection name "readonly" is reserved')
  for (const f of fields) {
    if (!f.required) continue
    const v = values[f.key]
    if (v === undefined || v === null || String(v).trim() === '') errors.push(`${f.label} is required`)
  }
  return errors
}

export function buildConnection(
  adapter: string,
  fields: Field[],
  values: Record<string, unknown>,
): Record<string, unknown> {
  const conn: Record<string, unknown> = { adapter }
  for (const f of fields) {
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
