import { describe, expect, it } from 'vitest'
import { splitAll, splitRedisCommands, splitStatements, statementAt } from './statements'

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

  it('anchors a statement start past a previous line trailing comment', () => {
    const text = 'select 1; -- note\nselect 2;'
    const r = splitStatements(text)
    // the trailing comment stays out of the next statement's text and offset,
    // so the Run CodeLens anchors on the `select 2` line, not the comment above
    expect(r.map(s => s.text)).toEqual(['select 1', 'select 2'])
    expect(text.slice(r[1].start).startsWith('select 2')).toBe(true)
  })

  it('ignores semicolons inside double-quoted identifiers', () => {
    const r = splitStatements('select 1 as ";not;a;split"; select 2')
    expect(r.map(s => s.text)).toEqual(['select 1 as ";not;a;split"', 'select 2'])
  })

  it('handles doubled quotes inside double-quoted identifiers', () => {
    const r = splitStatements('select 1 as "a"";b"; select 2')
    expect(r).toHaveLength(2)
  })

  it('ignores semicolons inside dollar-quoted strings', () => {
    const r = splitStatements('select $$a;b$$; select 2')
    expect(r.map(s => s.text)).toEqual(['select $$a;b$$', 'select 2'])
  })

  it('ignores semicolons inside tagged dollar quotes', () => {
    const body = 'create function f() returns void as $fn$ begin update t set x = 1; end $fn$ language plpgsql; select 2'
    const r = splitStatements(body)
    expect(r).toHaveLength(2)
    expect(r[1].text).toBe('select 2')
  })

  it('does not treat mismatched dollar tags as closing', () => {
    const r = splitStatements('select $a$ ; $b$ ; $a$; select 2')
    expect(r.map(s => s.text)).toEqual(['select $a$ ; $b$ ; $a$', 'select 2'])
  })

  it('does not confuse positional params with dollar quotes', () => {
    const r = splitStatements('select $1; select $2')
    expect(r.map(s => s.text)).toEqual(['select $1', 'select $2'])
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

describe('splitRedisCommands', () => {
  it('one command per line, skipping comments and blanks', () => {
    const r = splitRedisCommands('# seed\nGET crew:1:name\n\n  # note\nHGETALL boat:1\n')
    expect(r.map(s => s.text)).toEqual(['GET crew:1:name', 'HGETALL boat:1'])
  })

  it('trims whitespace but keeps original offsets', () => {
    const text = '  GET a  \nSET b 1'
    const r = splitRedisCommands(text)
    expect(r[0]).toEqual({ text: 'GET a', start: 0, end: 9 })
    expect(r[1].start).toBe(10)
  })

  it('does not treat mid-line # as a comment (valid in key names)', () => {
    expect(splitRedisCommands('GET key#1').map(s => s.text)).toEqual(['GET key#1'])
  })
})

describe('splitAll', () => {
  it('returns every SQL statement in order', () => {
    expect(splitAll('select 1;\nselect 2;\nselect 3').map(s => s.text)).toEqual([
      'select 1',
      'select 2',
      'select 3',
    ])
  })

  it('splits redis text per non-comment line', () => {
    expect(splitAll('# comment\nGET a\nSET b 1', 'redis').map(s => s.text)).toEqual(['GET a', 'SET b 1'])
  })

  it('drops trailing empty/comment-only fragments', () => {
    expect(splitAll('select 1;\n-- trailing comment\n').map(s => s.text)).toEqual(['select 1'])
  })
})

describe('PartiQL splitting (dollar-quoting off)', () => {
  it('does not read a bare $…$ as a dollar-quote, so a ; inside still splits', () => {
    // postgres would treat `$x$ ; $x$` as one dollar-quoted block; PartiQL has no
    // dollar-quoting, so every ; is a real boundary
    expect(splitStatements('a $x$ ; $x$ b ; SELECT 2', true).map(s => s.text))
      .toEqual(['a $x$ ; $x$ b', 'SELECT 2'])
    expect(splitStatements('a $x$ ; $x$ b ; SELECT 2', false).map(s => s.text))
      .toEqual(['a $x$', '$x$ b', 'SELECT 2'])
  })

  it('keeps quoted attribute paths and ? parameters intact while splitting on ;', () => {
    const sql = 'SELECT "a;b" FROM "Music" WHERE "Artist" = ? AND "Title" = ?; DELETE FROM "Music" WHERE "Artist" = ?'
    const r = splitStatements(sql, false)
    expect(r).toHaveLength(2)
    expect(r[0].text).toBe('SELECT "a;b" FROM "Music" WHERE "Artist" = ? AND "Title" = ?')
    expect(r[1].text).toBe('DELETE FROM "Music" WHERE "Artist" = ?')
  })

  it('leaves ; and $ inside single-quoted values alone', () => {
    const r = splitStatements("INSERT INTO \"T\" VALUE {'p':'a;$5'}; SELECT 2", false)
    expect(r.map(s => s.text)).toEqual(["INSERT INTO \"T\" VALUE {'p':'a;$5'}", 'SELECT 2'])
  })

  it('splitAll and statementAt route the partiql syntax', () => {
    expect(splitAll('a $x$ ; $x$ b', 'partiql').map(s => s.text)).toEqual(['a $x$', '$x$ b'])
    expect(statementAt('a $x$ ; $x$ b', 0, 'partiql')?.text).toBe('a $x$')
    expect(statementAt('a $x$ ; $x$ b', 0, 'sql')?.text).toBe('a $x$ ; $x$ b')
  })
})

describe('statementAt with languageId', () => {
  const text = '# comment\nGET crew:1:name\nHGETALL boat:1'

  it('redis: returns the line under the cursor', () => {
    expect(statementAt(text, text.indexOf('crew'), 'redis')?.text).toBe('GET crew:1:name')
    expect(statementAt(text, text.length, 'redis')?.text).toBe('HGETALL boat:1')
  })

  it('redis: returns undefined on comment and blank lines', () => {
    expect(statementAt(text, 3, 'redis')).toBeUndefined()
    expect(statementAt('GET a\n\nGET b', 6, 'redis')).toBeUndefined()
  })

  it('redis: cursor at end of line belongs to that line, start of next to the next', () => {
    const two = 'GET a\nGET b'
    expect(statementAt(two, 5, 'redis')?.text).toBe('GET a')
    expect(statementAt(two, 6, 'redis')?.text).toBe('GET b')
  })

  it('defaults to sql splitting', () => {
    expect(statementAt('select 1; select 2', 12)?.text).toBe('select 2')
  })
})
