import { describe, expect, it } from 'vitest'
import { ADAPTERS, adapterById, adapterIds, allPresentations, presentations } from '../../../src/adapters/registry'

describe('adapter rollout gating', () => {
  it('enabled views expose only rolled-out adapters', () => {
    expect(adapterIds).toEqual(['postgres', 'mysql', 'mariadb'])
    expect(ADAPTERS.map(m => m.presentation.id)).toEqual(['postgres', 'mysql', 'mariadb'])
    expect(presentations().map(p => p.id)).toEqual(['postgres', 'mysql', 'mariadb'])
  })

  it('the full presentation list keeps every registered adapter, in registry order', () => {
    expect(allPresentations().map(p => p.id)).toEqual([
      'postgres', 'mysql', 'mariadb', 'sqlite', 'mssql', 'clickhouse', 'cassandra',
      'neo4j', 'mongodb', 'elasticsearch', 'kafka', 'redis', 'dynamodb',
    ])
  })

  it('mariadb aliases the mysql adapter surface', () => {
    const maria = adapterById.get('mariadb')!.presentation
    const my = adapterById.get('mysql')!.presentation
    expect(maria.label).toBe('MariaDB')
    expect(maria.emoji).toBe('🦭')
    expect(maria.iconFile).toBe('mariadb.svg')
    expect(maria.fields).toEqual(my.fields)
    expect(maria.writeRule).toEqual(my.writeRule)
    expect(maria.completionTriggers).toEqual(my.completionTriggers)
  })

  it('adapterById still resolves adapters that are not enabled', () => {
    expect(adapterById.get('redis')?.presentation.id).toBe('redis')
  })
})

describe('table filter metadata', () => {
  it('declares where each adapter keeps its tables', () => {
    const where = new Map(allPresentations().map(p => [p.id, p.tableParent]))
    for (const id of ['postgres', 'mysql', 'mariadb', 'mssql', 'clickhouse', 'cassandra']) {
      expect(where.get(id)).toBe('schema')
    }
    for (const id of ['sqlite', 'mongodb', 'kafka', 'elasticsearch', 'neo4j', 'dynamodb']) {
      expect(where.get(id)).toBe('connection')
    }
  })

  // A new adapter that forgets tableParent silently loses the Explorer filter.
  // redis is the only engine with no tables, so it is the only allowed omission.
  it('leaves no adapter undeclared except the one with no tables', () => {
    const undeclared = allPresentations().filter(p => p.tableParent === undefined).map(p => p.id)
    expect(undeclared).toEqual(['redis'])
  })
})
