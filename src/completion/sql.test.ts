import { describe, expect, it, vi } from 'vitest'

vi.mock('vscode', () => ({}))

import { sqlContext, resolveAlias, wordPrefix, SQL_KEYWORDS, SQL_FUNCTIONS } from './sql'

describe('sqlContext', () => {
  it('a table-introducing keyword means table completion', () => {
    expect(sqlContext('SELECT * FROM ')).toBe('table')
    expect(sqlContext('select * from ')).toBe('table')
    expect(sqlContext('SELECT * FROM us')).toBe('table')
    expect(sqlContext('SELECT * FROM users u JOIN ')).toBe('table')
    expect(sqlContext('SELECT * FROM accounts JOIN ')).toBe('table')
    expect(sqlContext('INSERT INTO ')).toBe('table')
    expect(sqlContext('UPDATE ')).toBe('table')
    expect(sqlContext('update ')).toBe('table')
    expect(sqlContext('DROP TABLE ')).toBe('table')
  })

  it('an alias followed by a dot qualifies columns by that alias', () => {
    expect(sqlContext('SELECT * FROM users u WHERE u.')).toEqual({ alias: 'u' })
    expect(sqlContext('SELECT o.')).toEqual({ alias: 'o' })
    expect(sqlContext('SELECT count(u.')).toEqual({ alias: 'u' })
    expect(sqlContext('WHERE u.na')).toEqual({ alias: 'u' })
  })

  it('SELECT and WHERE clauses mean column completion', () => {
    expect(sqlContext('SELECT ')).toBe('column')
    expect(sqlContext('SELECT id, ')).toBe('column')
    expect(sqlContext('SELECT * FROM users WHERE ')).toBe('column')
    expect(sqlContext('UPDATE users SET ')).toBe('column')
  })

  it('a word merely containing a keyword is not read as that keyword', () => {
    expect(sqlContext('SELECT performed ')).toBe('column')
    expect(sqlContext('SELECT last_updated ')).toBe('column') // contains "update"
  })

  it('no recognised keyword at all defaults to column', () => {
    expect(sqlContext('')).toBe('column')
    expect(sqlContext('foo ')).toBe('column')
  })
})

describe('resolveAlias', () => {
  it('resolves a plain FROM alias', () => {
    expect(resolveAlias('SELECT * FROM users u', 'u')).toBe('users')
  })

  it('resolves an AS alias, case-insensitively on the keyword', () => {
    expect(resolveAlias('SELECT * FROM users AS u', 'u')).toBe('users')
    expect(resolveAlias('select * from users as u', 'u')).toBe('users')
  })

  it('resolves a double-quoted table name and strips the quotes', () => {
    expect(resolveAlias('SELECT * FROM "My Table" t', 't')).toBe('My Table')
    expect(resolveAlias('SELECT * FROM "My Table" AS t', 't')).toBe('My Table')
  })

  it('resolves across multiple joins', () => {
    const q = 'SELECT * FROM accounts a JOIN orders o ON a.id = o.account_id JOIN items i ON i.order_id = o.id'
    expect(resolveAlias(q, 'a')).toBe('accounts')
    expect(resolveAlias(q, 'o')).toBe('orders')
    expect(resolveAlias(q, 'i')).toBe('items')
  })

  it('skips a missing alias on an earlier table', () => {
    expect(resolveAlias('SELECT * FROM accounts JOIN orders o', 'o')).toBe('orders')
  })

  it('is case-insensitive on the alias itself', () => {
    expect(resolveAlias('SELECT * FROM users U', 'u')).toBe('users')
  })

  it('returns undefined for an unknown alias', () => {
    expect(resolveAlias('SELECT * FROM users u', 'x')).toBeUndefined()
    expect(resolveAlias('SELECT * FROM users WHERE id = 1', 'x')).toBeUndefined()
  })
})

describe('wordPrefix', () => {
  it('returns the identifier fragment at the cursor', () => {
    expect(wordPrefix('SELECT * FROM us')).toBe('us')
    expect(wordPrefix('SELECT * FROM ')).toBe('')
    expect(wordPrefix('WHERE u.na')).toBe('na')
    expect(wordPrefix('WHERE u.')).toBe('')
  })
})

describe('SQL keyword and function tables', () => {
  it('have no duplicate labels', () => {
    expect(new Set(SQL_KEYWORDS).size).toBe(SQL_KEYWORDS.length)
    expect(new Set(SQL_FUNCTIONS).size).toBe(SQL_FUNCTIONS.length)
  })

  it('do not overlap', () => {
    const fns = new Set(SQL_FUNCTIONS)
    expect(SQL_KEYWORDS.some(k => fns.has(k))).toBe(false)
  })

  it('cover the core statement keywords', () => {
    for (const k of ['SELECT', 'FROM', 'WHERE', 'JOIN', 'INSERT', 'UPDATE', 'DELETE']) {
      expect(SQL_KEYWORDS).toContain(k)
    }
  })
})
