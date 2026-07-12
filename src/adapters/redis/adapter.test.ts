import { describe, expect, it } from 'vitest'
import { groupKeys, replyToEnvelope, tokenizeRedisCommand } from './adapter'

describe('tokenizeRedisCommand', () => {
  it('splits on whitespace', () => {
    expect(tokenizeRedisCommand('SET crew:1:name ada')).toEqual(['SET', 'crew:1:name', 'ada'])
    expect(tokenizeRedisCommand('  GET   a  ')).toEqual(['GET', 'a'])
  })

  it('double quotes group words and unescape', () => {
    expect(tokenizeRedisCommand('SET "my key" "a b"')).toEqual(['SET', 'my key', 'a b'])
    expect(tokenizeRedisCommand('SET k "line1\\nline2\\t\\"q\\" \\\\"')).toEqual(['SET', 'k', 'line1\nline2\t"q" \\'])
    expect(tokenizeRedisCommand('SET k "\\x41\\x42"')).toEqual(['SET', 'k', 'AB'])
  })

  it('single quotes are literal except escaped quote', () => {
    expect(tokenizeRedisCommand("SET k 'a \\n b'")).toEqual(['SET', 'k', 'a \\n b'])
    expect(tokenizeRedisCommand("SET k 'it\\'s'")).toEqual(['SET', 'k', "it's"])
  })

  it('empty quoted strings are valid args', () => {
    expect(tokenizeRedisCommand('SET k ""')).toEqual(['SET', 'k', ''])
  })

  it('throws on unbalanced quotes and missing separator after a quote', () => {
    expect(() => tokenizeRedisCommand('SET k "oops')).toThrow(/quote/)
    expect(() => tokenizeRedisCommand("SET k 'oops")).toThrow(/quote/)
    expect(() => tokenizeRedisCommand('SET k "a"b')).toThrow(/space/)
  })
})

describe('replyToEnvelope', () => {
  it('scalar reply becomes a single value row', () => {
    const e = replyToEnvelope('OK', 5, 500)
    expect(e.columns.map(c => c.name)).toEqual(['value'])
    expect(e.rows).toEqual([['OK']])
    expect(e.rowCount).toBe(1)
    expect(e.elapsedMs).toBe(5)
  })

  it('null reply is zero rows with a (nil) warning', () => {
    const e = replyToEnvelope(null, 1, 500)
    expect(e.rows).toEqual([])
    expect(e.rowCount).toBe(0)
    expect(e.warnings).toEqual(['(nil)'])
  })

  it('array reply becomes numbered rows, nested values stringified', () => {
    const e = replyToEnvelope(['a', ['x', 'y'], null], 1, 500)
    expect(e.columns.map(c => c.name)).toEqual(['#', 'value'])
    expect(e.rows).toEqual([[1, 'a'], [2, '["x","y"]'], [3, null]])
  })

  it('object reply (RESP3 hash) becomes field/value rows', () => {
    const e = replyToEnvelope({ name: 'TupleBase One', oars: '2' }, 1, 500)
    expect(e.columns.map(c => c.name)).toEqual(['field', 'value'])
    expect(e.rows).toEqual([['name', 'TupleBase One'], ['oars', '2']])
  })

  it('caps rows at pageSize with a warning', () => {
    const e = replyToEnvelope(['a', 'b', 'c'], 1, 2)
    expect(e.rows).toHaveLength(2)
    expect(e.rowCount).toBe(3)
    expect(e.warnings[0]).toMatch(/first 2 of 3/)
  })
})

describe('groupKeys', () => {
  const keys = [
    'crew:1:name', 'crew:1:role', 'crew:2:name', 'boat:1', 'boat:2',
    'queue:departures', 'stats:voyages:total', 'plain',
  ]

  it('groups root keys into namespaces plus bare leaves', () => {
    const { namespaces, leaves } = groupKeys(keys, '')
    expect(namespaces).toEqual([
      { segment: 'boat', count: 2 },
      { segment: 'crew', count: 3 },
      { segment: 'queue', count: 1 },
      { segment: 'stats', count: 1 },
    ])
    expect(leaves).toEqual(['plain'])
  })

  it('descends one level at a time', () => {
    const crew = groupKeys(keys, 'crew:')
    expect(crew.namespaces).toEqual([{ segment: '1', count: 2 }, { segment: '2', count: 1 }])
    expect(crew.leaves).toEqual([])
    expect(groupKeys(keys, 'crew:1:').leaves).toEqual(['crew:1:name', 'crew:1:role'])
  })

  it('a key can be both a leaf and a namespace', () => {
    const { namespaces, leaves } = groupKeys(['a:b', 'a:b:c'], 'a:')
    expect(namespaces).toEqual([{ segment: 'b', count: 1 }])
    expect(leaves).toEqual(['a:b'])
  })
})
