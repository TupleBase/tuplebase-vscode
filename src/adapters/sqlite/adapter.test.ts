import { describe, expect, it } from 'vitest'
import { sqliteFactory, sqNodeId, parseSqNodeId, resolveDbPath } from './adapter'

describe('sqliteFactory.validate', () => {
  it('requires a path', () => {
    expect(sqliteFactory.validate({ adapter: 'sqlite' })).toEqual(['path is required'])
    expect(sqliteFactory.validate({ adapter: 'sqlite', path: '' })).toEqual(['path is required'])
  })

  it('passes a complete config', () => {
    expect(sqliteFactory.validate({ adapter: 'sqlite', path: '/tmp/app.sqlite' })).toEqual([])
  })

  it('needs no secrets (file-based, no password)', () => {
    expect(sqliteFactory.requiredSecrets({ group: 'g', name: 'n', adapter: 'sqlite', readonly: false })).toEqual([])
  })
})

describe('sqNodeId', () => {
  it('round-trips segments, preserving names that contain dots', () => {
    expect(parseSqNodeId(sqNodeId('orders.v2', 'id'))).toEqual(['orders.v2', 'id'])
  })
})

describe('resolveDbPath', () => {
  it('keeps absolute paths as-is', () => {
    expect(resolveDbPath({ path: '/data/app.sqlite', baseDir: '/workspace' })).toBe('/data/app.sqlite')
  })

  it('resolves a relative path against the config directory (not cwd)', () => {
    expect(resolveDbPath({ path: '../seed/demo.sqlite', baseDir: '/workspace/dev/playground' }))
      .toBe('/workspace/dev/seed/demo.sqlite')
    expect(resolveDbPath({ path: 'demo.sqlite', baseDir: '/ws' })).toBe('/ws/demo.sqlite')
  })
})
