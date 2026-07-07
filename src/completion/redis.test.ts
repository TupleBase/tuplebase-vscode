import { describe, expect, it, vi } from 'vitest'

vi.mock('vscode', () => ({}))

import { lineContext, wordPrefix, REDIS_COMMANDS } from './redis'

describe('lineContext', () => {
  it('cursor in the first word means command completion', () => {
    expect(lineContext('')).toBe('command')
    expect(lineContext('GE')).toBe('command')
    expect(lineContext('  HGE')).toBe('command')
  })

  it('cursor after the first word means key completion', () => {
    expect(lineContext('GET ')).toBe('key')
    expect(lineContext('GET user:')).toBe('key')
    expect(lineContext('  SET key val')).toBe('key')
  })

  it('comment lines produce nothing', () => {
    expect(lineContext('# GET foo')).toBe('none')
    expect(lineContext('   # note')).toBe('none')
    expect(lineContext('#')).toBe('none')
  })
})

describe('wordPrefix', () => {
  it('returns the token being typed', () => {
    expect(wordPrefix('GET user:')).toBe('user:')
    expect(wordPrefix('GET ')).toBe('')
    expect(wordPrefix('MSET a 1 b')).toBe('b')
  })
})

describe('REDIS_COMMANDS table', () => {
  it('every entry has a name, hint and description', () => {
    for (const c of REDIS_COMMANDS) {
      expect(c.name.length).toBeGreaterThan(0)
      expect(c.hint.length).toBeGreaterThan(0)
      expect(c.doc.length).toBeGreaterThan(0)
    }
  })

  it('names are uppercase and unique, hints start with the name', () => {
    const names = REDIS_COMMANDS.map(c => c.name)
    expect(new Set(names).size).toBe(names.length)
    for (const c of REDIS_COMMANDS) {
      expect(c.name).toBe(c.name.toUpperCase())
      expect(c.hint.startsWith(c.name)).toBe(true)
    }
  })

  it('covers the core command set', () => {
    const names = new Set(REDIS_COMMANDS.map(c => c.name))
    for (const required of ['GET', 'SET', 'DEL', 'SCAN', 'HGETALL', 'LRANGE', 'ZADD', 'PUBLISH']) {
      expect(names.has(required)).toBe(true)
    }
    expect(names.size).toBeGreaterThanOrEqual(50)
  })
})
