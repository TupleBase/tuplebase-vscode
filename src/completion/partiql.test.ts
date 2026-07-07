import { describe, expect, it } from 'vitest'
import { buildPartiqlItems, PARTIQL_KEYWORDS, PARTIQL_FUNCTIONS } from './partiql'
import type { SchemaItem } from '../adapters/types'

const table = (name: string): SchemaItem => ({ kind: 'table', name })
const attr = (name: string, parent?: string, detail?: string): SchemaItem => ({ kind: 'column', name, parent, detail })

describe('buildPartiqlItems', () => {
  it('quotes table names in insertText but leaves the label bare', () => {
    const items = buildPartiqlItems('', [table('Music')], [])
    const t = items.find(i => i.kind === 'table' && i.label === 'Music')
    expect(t?.insertText).toBe('"Music"')
  })

  it('filters keywords, functions, tables and attributes by prefix', () => {
    const items = buildPartiqlItems('se', [table('sessions'), table('orders')], [attr('secret')])
    const labels = items.map(i => i.label)
    expect(labels).toContain('SELECT')   // keyword se…
    expect(labels).toContain('SET')      // keyword se…
    expect(labels).not.toContain('FROM') // filtered out
    expect(labels).toContain('sessions') // table se…
    expect(labels).not.toContain('orders')
    expect(labels).toContain('secret')   // attribute se…
    expect(labels).not.toContain('size') // function does not start with se
  })

  it('carries table and type into the attribute detail', () => {
    const items = buildPartiqlItems('', [], [attr('pk', 'Music', 'S')])
    expect(items.find(i => i.kind === 'attribute')?.detail).toBe('Music: S')
  })

  it('includes the core PartiQL keywords and functions', () => {
    const labels = new Set(buildPartiqlItems('', [], []).map(i => i.label))
    for (const k of ['SELECT', 'FROM', 'WHERE', 'MISSING', 'RETURNING']) expect(labels.has(k)).toBe(true)
    for (const f of ['begins_with', 'contains', 'attribute_exists']) expect(labels.has(f)).toBe(true)
  })

  it('has no duplicate keyword or function labels', () => {
    expect(new Set(PARTIQL_KEYWORDS).size).toBe(PARTIQL_KEYWORDS.length)
    expect(new Set(PARTIQL_FUNCTIONS).size).toBe(PARTIQL_FUNCTIONS.length)
  })
})
