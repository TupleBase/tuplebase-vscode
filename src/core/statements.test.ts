import { describe, expect, it } from 'vitest'
import { splitStatements, statementAt } from './statements'

describe('splitStatements', () => {
  it('splits on semicolons', () => {
    const r = splitStatements('select 1; select 2;')
    expect(r.map(s => s.text)).toEqual(['select 1', 'select 2'])
  })

  it('ignores semicolons inside single-quoted strings', () => {
    const r = splitStatements("select 'a;b'; select 2")
    expect(r.map(s => s.text)).toEqual(["select 'a;b'", 'select 2'])
  })

  it('handles escaped quotes (doubled) inside strings', () => {
    const r = splitStatements("select 'it''s;fine'; select 2")
    expect(r).toHaveLength(2)
  })

  it('ignores semicolons in line and block comments', () => {
    const r = splitStatements('select 1 -- no; split\n; select 2 /* not; here */')
    expect(r.map(s => s.text.trim())).toEqual(['select 1 -- no; split', 'select 2 /* not; here */'])
  })

  it('skips empty statements', () => {
    expect(splitStatements(';;  ;')).toEqual([])
  })

  it('reports offsets usable for statementAt', () => {
    const text = 'select 1;\nselect 2;'
    const second = statementAt(text, text.indexOf('2'))
    expect(second?.text.trim()).toBe('select 2')
  })

  it('statementAt on boundary returns the statement before the cursor', () => {
    const text = 'select 1;'
    expect(statementAt(text, 9)?.text).toBe('select 1')
  })
})
