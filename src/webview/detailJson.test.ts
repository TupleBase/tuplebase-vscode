import { describe, expect, it } from 'vitest'
import { formatRow } from './detailJson'

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
