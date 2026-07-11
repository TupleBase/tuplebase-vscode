import { describe, expect, it } from 'vitest'
import { mongodbFactory, parseMongo, mgNodeId, parseMgNodeId } from './adapter'

describe('mongodbFactory.validate', () => {
  it('requires host and database', () => {
    expect(mongodbFactory.validate({ adapter: 'mongodb' })).toEqual(['host is required', 'database is required'])
  })

  it('passes a complete config', () => {
    expect(mongodbFactory.validate({ adapter: 'mongodb', host: 'h', database: 'd' })).toEqual([])
  })

  it('prompts for a password only when auth is enabled', () => {
    const base = { group: 'g', name: 'n', adapter: 'mongodb', readonly: false }
    expect(mongodbFactory.requiredSecrets({ ...base })).toEqual([])
    expect(mongodbFactory.requiredSecrets({ ...base, auth: true })).toEqual(['password'])
  })
})

describe('parseMongo', () => {
  it('parses a collection, method and JSON args', () => {
    expect(parseMongo('db.crew.find({"role":"captain"})')).toEqual({ collection: 'crew', method: 'find', args: [{ role: 'captain' }] })
    expect(parseMongo('db.crew.find()')).toEqual({ collection: 'crew', method: 'find', args: [] })
    expect(parseMongo('db.crew.updateOne({"id":1},{"$set":{"role":"cook"}});')).toEqual({
      collection: 'crew', method: 'updateone', args: [{ id: 1 }, { $set: { role: 'cook' } }],
    })
  })

  it('rejects non-commands and non-JSON args', () => {
    expect(() => parseMongo('select 1')).toThrow(/expected db/)
    expect(() => parseMongo('db.crew.find({role:1})')).toThrow(/valid JSON/)
  })
})

describe('mgNodeId', () => {
  it('round-trips segments, preserving names that contain dots', () => {
    expect(parseMgNodeId(mgNodeId('crew.v2', 'name'))).toEqual(['crew.v2', 'name'])
  })
})
