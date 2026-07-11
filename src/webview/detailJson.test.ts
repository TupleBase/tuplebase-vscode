import { describe, expect, it } from 'vitest'
import { formatRow, rowToHtml } from './detailJson'

describe('formatRow', () => {
  it('renders a row as a pretty JSON object keyed by column name', () => {
    expect(formatRow([{ name: 'id' }, { name: 'name' }], [1, 'ada'])).toBe(
      '{\n  "id": 1,\n  "name": "ada"\n}',
    )
  })

  it('preserves null values', () => {
    expect(formatRow([{ name: 'note' }], [null])).toBe('{\n  "note": null\n}')
  })

  it('renders missing/undefined cells as null so the key stays visible', () => {
    expect(formatRow([{ name: 'a' }, { name: 'b' }], [1])).toBe(
      '{\n  "a": 1,\n  "b": null\n}',
    )
  })

  it('nests structured values (dynamo items, json columns)', () => {
    expect(formatRow([{ name: 'item' }], [{ sku: 'x', tags: ['a', 'b'] }])).toBe(
      '{\n  "item": {\n    "sku": "x",\n    "tags": [\n      "a",\n      "b"\n    ]\n  }\n}',
    )
  })

  it('stringifies bigint so JSON.stringify does not throw', () => {
    expect(formatRow([{ name: 'big' }], [9007199254740993n])).toBe(
      '{\n  "big": "9007199254740993"\n}',
    )
  })
})

describe('rowToHtml', () => {
  it('colours keys and scalar types with theme token classes', () => {
    const html = rowToHtml([{ name: 'id' }, { name: 'name' }, { name: 'ok' }], [1, 'ada', true])
    expect(html).toContain('<span class="jx-key">"id"</span>')
    expect(html).toContain('<span class="jx-num">1</span>')
    expect(html).toContain('<span class="jx-str">"ada"</span>')
    expect(html).toContain('<span class="jx-bool">true</span>')
  })

  it('makes nested objects and arrays collapsible with native details', () => {
    const html = rowToHtml([{ name: 'item' }], [{ tags: ['a', 'b'] }])
    expect(html).toContain('<details open class="jx-node">')
    expect(html.match(/<details/g)!.length).toBeGreaterThanOrEqual(3) // row obj + item obj + tags array
  })

  it('escapes HTML in strings and keys, and renders null', () => {
    const html = rowToHtml([{ name: '<x>' }], [null])
    expect(html).toContain('&lt;x&gt;')
    expect(html).toContain('<span class="jx-null">null</span>')
    expect(html).not.toContain('<x>')
  })
})
