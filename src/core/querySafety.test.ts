import { describe, expect, it } from 'vitest'
import { isWriteStatement } from './querySafety'

describe('isWriteStatement', () => {
  it('recognizes Postgres DML and DDL writes', () => {
    expect(isWriteStatement('postgres', 'SELECT * FROM crew')).toBe(false)
    expect(isWriteStatement('postgres', '-- note\nDELETE FROM crew')).toBe(true)
    expect(isWriteStatement('postgres', 'CREATE TABLE logs (id int)')).toBe(true)
  })

  it('only permits known read-only Redis commands', () => {
    expect(isWriteStatement('redis', 'GET crew:1:name')).toBe(false)
    expect(isWriteStatement('redis', 'SET crew:1:name ada')).toBe(true)
    expect(isWriteStatement('redis', 'FLUSHALL')).toBe(true)
  })

  it('recognizes PartiQL writes', () => {
    expect(isWriteStatement('dynamodb', 'SELECT * FROM voyages')).toBe(false)
    expect(isWriteStatement('dynamodb', "INSERT INTO voyages VALUE {'id': 1}")).toBe(true)
  })
})
