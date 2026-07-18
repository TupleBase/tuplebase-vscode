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

  it('treats SQL-family adapters like postgres (reads are not writes)', () => {
    for (const adapter of ['mysql', 'sqlite', 'mssql', 'clickhouse', 'cassandra']) {
      expect(isWriteStatement(adapter, 'select * from crew')).toBe(false)
      expect(isWriteStatement(adapter, 'insert into crew values (1)')).toBe(true)
      expect(isWriteStatement(adapter, 'DROP TABLE crew')).toBe(true)
    }
  })

  it('recognizes Cypher writes but allows reads', () => {
    expect(isWriteStatement('neo4j', 'MATCH (n) RETURN n')).toBe(false)
    expect(isWriteStatement('neo4j', 'CREATE (:Crew {id: 1})')).toBe(true)
    expect(isWriteStatement('neo4j', 'MATCH (n) DETACH DELETE n')).toBe(true)
  })

  it('classifies MongoDB collection methods', () => {
    expect(isWriteStatement('mongodb', 'db.crew.find({})')).toBe(false)
    expect(isWriteStatement('mongodb', 'db.crew.aggregate([])')).toBe(false)
    expect(isWriteStatement('mongodb', 'db.crew.insertOne({ id: 1 })')).toBe(true)
    expect(isWriteStatement('mongodb', 'db.crew.deleteMany({})')).toBe(true)
  })

  it('classifies Elasticsearch and Kafka verbs', () => {
    expect(isWriteStatement('elasticsearch', 'GET /crew/_search')).toBe(false)
    expect(isWriteStatement('elasticsearch', 'POST /crew/_doc { }')).toBe(true)
    expect(isWriteStatement('kafka', 'consume crew 10')).toBe(false)
    expect(isWriteStatement('kafka', 'produce crew key value')).toBe(true)
  })
})
