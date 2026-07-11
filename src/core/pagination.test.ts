import { describe, expect, it } from 'vitest'
import { offsetFromToken, windowedSql } from './pagination'

describe('windowedSql', () => {
  it('appends a bounded window (pageSize+1 sentinel) to a plain SELECT', () => {
    expect(windowedSql('select * from crew', 500, 0)).toEqual({
      sql: 'select * from crew limit 501 offset 0', offset: 0, paginated: true,
    })
  })

  it('keeps an ORDER BY before the injected LIMIT and honours the offset', () => {
    expect(windowedSql('select id from crew order by id', 100, 200).sql)
      .toBe('select id from crew order by id limit 101 offset 200')
  })

  it('paginates WITH / TABLE / VALUES reads', () => {
    expect(windowedSql('with c as (select 1) select * from c', 10, 0).paginated).toBe(true)
    expect(windowedSql('table crew', 10, 0).paginated).toBe(true)
  })

  it('leaves statements that already limit/offset/lock alone', () => {
    expect(windowedSql('select * from crew limit 10', 500, 0).paginated).toBe(false)
    expect(windowedSql('select * from crew offset 5', 500, 0).paginated).toBe(false)
    expect(windowedSql('select * from crew for update', 500, 0).paginated).toBe(false)
  })

  it('never rewrites writes or DDL', () => {
    expect(windowedSql('insert into crew values (1)', 500, 0).paginated).toBe(false)
    expect(windowedSql('update crew set x = 1', 500, 0).paginated).toBe(false)
    expect(windowedSql('delete from crew', 500, 0).paginated).toBe(false)
    expect(windowedSql('create table t (id int)', 500, 0).paginated).toBe(false)
  })

  it('strips a trailing semicolon before appending', () => {
    expect(windowedSql('select 1;', 10, 0).sql).toBe('select 1 limit 11 offset 0')
  })
})

describe('offsetFromToken', () => {
  it('parses a numeric token, defaulting to 0', () => {
    expect(offsetFromToken('500')).toBe(500)
    expect(offsetFromToken(undefined)).toBe(0)
    expect(offsetFromToken('nope')).toBe(0)
    expect(offsetFromToken('-1')).toBe(0)
  })
})
