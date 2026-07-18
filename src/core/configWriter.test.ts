import { describe, expect, it } from 'vitest'
import { parse } from 'jsonc-parser'
import { addConnection, addGroup, deleteGroup, moveConnection, removeConnection, renameGroup } from './configWriter'

const TWO = `{
  "version": 1,
  "groups": {
    "local": {
      "local-pg": { "adapter": "postgres", "host": "localhost" },
      "cache": { "adapter": "redis", "host": "localhost" }
    },
    "prod": {
      "orders": { "adapter": "postgres", "host": "p" }
    }
  }
}`

const CONFIG = `{
  // dev config — keep me
  "version": 1,
  "groups": {
    "local": {
      "local-pg": { "adapter": "postgres", "host": "localhost" }
    }
  }
}`

describe('configWriter', () => {
  it('addGroup appends an empty group and preserves comments', () => {
    const out = addGroup(CONFIG, 'prod')
    expect(out).toContain('// dev config — keep me')
    const cfg = parse(out)
    expect(cfg.groups.prod).toEqual({})
    expect(cfg.groups.local['local-pg'].adapter).toBe('postgres') // siblings intact
  })

  it('addConnection nests a connection under an existing group', () => {
    const out = addConnection(CONFIG, 'local', 'cache', { adapter: 'redis', host: 'localhost' })
    const cfg = parse(out)
    expect(cfg.groups.local.cache).toEqual({ adapter: 'redis', host: 'localhost' })
    expect(cfg.groups.local['local-pg']).toBeDefined()
  })

  it('addConnection can create the connection in a freshly added group', () => {
    const out = addConnection(addGroup(CONFIG, 'prod'), 'prod', 'orders', { adapter: 'postgres', host: 'p' })
    const cfg = parse(out)
    expect(cfg.groups.prod.orders.host).toBe('p')
  })

  it('deleteGroup removes a group and its connections', () => {
    const cfg = parse(deleteGroup(TWO, 'local'))
    expect(cfg.groups).not.toHaveProperty('local')
    expect(cfg.groups.prod.orders).toBeDefined()
  })

  it('removeConnection removes one connection, leaving siblings', () => {
    const cfg = parse(removeConnection(TWO, 'local', 'cache'))
    expect(cfg.groups.local).not.toHaveProperty('cache')
    expect(cfg.groups.local['local-pg']).toBeDefined()
  })

  it('renameGroup moves all connections under the new name', () => {
    const cfg = parse(renameGroup(TWO, 'local', 'dev'))
    expect(cfg.groups).not.toHaveProperty('local')
    expect(Object.keys(cfg.groups.dev)).toEqual(['local-pg', 'cache'])
    expect(cfg.groups.dev['local-pg'].adapter).toBe('postgres')
  })

  it('moveConnection relocates a connection to another group', () => {
    const cfg = parse(moveConnection(TWO, 'local', 'prod', 'cache'))
    expect(cfg.groups.local).not.toHaveProperty('cache')
    expect(cfg.groups.prod.cache).toEqual({ adapter: 'redis', host: 'localhost' })
  })

  it('moveConnection is a no-op when the connection is not in the source group', () => {
    expect(moveConnection(TWO, 'local', 'prod', 'missing')).toBe(TWO)
  })
})
