import { describe, expect, it } from 'vitest'
import { parse } from 'jsonc-parser'
import { addConnection, addGroup } from './configWriter'

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
})
