import { describe, expect, it } from 'vitest'
import { dynamodbFactory, flattenItems } from './adapter'

describe('flattenItems', () => {
  it('unions columns across items in first-seen order', () => {
    const { columns, rows } = flattenItems([
      { a: 1, b: 2 },
      { b: 3, c: 4 },
    ])
    expect(columns.map(c => c.name)).toEqual(['a', 'b', 'c'])
    expect(rows).toEqual([[1, 2, null], [null, 3, 4]])
  })

  it('stringifies nested objects and arrays', () => {
    const { rows } = flattenItems([{ tags: ['x', 'y'], spec: { oars: 2 }, name: 'ada' }])
    expect(rows).toEqual([['["x","y"]', '{"oars":2}', 'ada']])
  })

  it('missing keys become null, explicit null stays null', () => {
    const { columns, rows } = flattenItems([{ a: null }, {}])
    expect(columns.map(c => c.name)).toEqual(['a'])
    expect(rows).toEqual([[null], [null]])
  })

  it('empty input yields no columns and no rows', () => {
    expect(flattenItems([])).toEqual({ columns: [], rows: [] })
  })
})

describe('dynamodbFactory', () => {
  it('requires region', () => {
    expect(dynamodbFactory.validate({ adapter: 'dynamodb' })).toEqual(['region is required'])
    expect(dynamodbFactory.validate({ adapter: 'dynamodb', region: '' })).toEqual(['region is required'])
    expect(dynamodbFactory.validate({ adapter: 'dynamodb', region: 'local' })).toEqual([])
  })

  it('stores no secrets — the AWS credential chain handles auth', () => {
    expect(dynamodbFactory.requiredSecrets({ group: 'e', name: 'n', adapter: 'dynamodb', readonly: false })).toEqual([])
  })
})
