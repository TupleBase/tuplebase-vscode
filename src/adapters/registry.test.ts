import { describe, expect, it } from 'vitest'
import { ADAPTERS, adapterById, adapterIds, allPresentations, presentations } from './registry'

describe('adapter rollout gating', () => {
  it('enabled views expose only rolled-out adapters', () => {
    expect(adapterIds).toEqual(['postgres'])
    expect(ADAPTERS.map(m => m.presentation.id)).toEqual(['postgres'])
    expect(presentations().map(p => p.id)).toEqual(['postgres'])
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
