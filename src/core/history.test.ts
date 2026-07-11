import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { HistoryStore, HistoryEntry } from './history'

const entry = (over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  ts: 1, group: 'dev', conn: 'local-pg', adapter: 'postgres', languageId: 'sql',
  statement: 'select 1', ok: true, elapsedMs: 5, ...over,
})

describe('HistoryStore', () => {
  let dir: string
  let store: HistoryStore

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rowboat-history-'))
    store = new HistoryStore(dir)
  })
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('lists newest first and honours the limit', () => {
    store.append(entry({ statement: 'select 1' }))
    store.append(entry({ statement: 'select 2' }))
    store.append(entry({ statement: 'select 3' }))
    expect(store.list().map(e => e.statement)).toEqual(['select 3', 'select 2', 'select 1'])
    expect(store.list(2).map(e => e.statement)).toEqual(['select 3', 'select 2'])
  })

  it('redacts AUTH commands', () => {
    store.append(entry({ statement: 'auth s3cr3t', languageId: 'redis' }))
    expect(store.list()[0].statement).toBe('AUTH ***')
  })

  it('redacts the AUTH clause of HELLO commands', () => {
    store.append(entry({ statement: 'HELLO 3 auth bob hunter2', languageId: 'redis' }))
    store.append(entry({ statement: 'HELLO 3', languageId: 'redis' }))
    expect(store.list().map(e => e.statement)).toEqual(['HELLO 3', 'HELLO 3 auth ***'])
  })

  it('leaves ordinary statements untouched', () => {
    store.append(entry({ statement: 'select author from books' }))
    expect(store.list()[0].statement).toBe('select author from books')
  })

  it('prunes to 500 entries once past 1000', () => {
    for (let i = 0; i < 1001; i++) store.append(entry({ ts: i, statement: `select ${i}` }))
    const lines = fs.readFileSync(path.join(dir, 'history.jsonl'), 'utf8').trim().split('\n')
    expect(lines).toHaveLength(500)
    expect(store.list(1)[0].statement).toBe('select 1000')
  })

  it('skips corrupt lines instead of crashing', () => {
    store.append(entry({ statement: 'select 1' }))
    fs.appendFileSync(path.join(dir, 'history.jsonl'), 'not json{\n')
    store.append(entry({ statement: 'select 2' }))
    expect(store.list().map(e => e.statement)).toEqual(['select 2', 'select 1'])
  })

  it('clears history', () => {
    store.append(entry())
    store.clear()
    expect(store.list()).toEqual([])
    store.append(entry({ statement: 'after clear' }))
    expect(store.list().map(e => e.statement)).toEqual(['after clear'])
  })
})
