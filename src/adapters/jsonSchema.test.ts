import { describe, expect, it } from 'vitest'
import { buildJsonSchema } from './jsonSchema'
import { adapterIds, presentations } from './registry'

type Any = Record<string, any>

describe('buildJsonSchema', () => {
  const schema = buildJsonSchema() as Any
  const branches: Any[] = schema.definitions.connection.allOf
  const branchFor = (id: string) => branches.find(b => b.if.properties.adapter.const === id)!.then

  it('lists every registered adapter in the connection enum, in registry order', () => {
    expect(schema.definitions.connection.properties.adapter.enum).toEqual(adapterIds)
    expect(branches.map(b => b.if.properties.adapter.const)).toEqual(adapterIds)
  })

  it('requires version and groups at the top level', () => {
    expect(schema.required).toEqual(['version', 'groups'])
    expect(schema.properties.version.const).toBe(1)
  })

  it('gives each adapter branch its required fields and a readonly toggle, sealed to known keys', () => {
    for (const p of presentations()) {
      const then = branchFor(p.id)
      expect(then.additionalProperties).toBe(false)
      expect(then.required).toEqual(p.fields.filter(f => f.required).map(f => f.key))
      expect(then.properties.readonly.type).toBe('boolean')
      for (const f of p.fields) expect(then.properties[f.key]).toBeDefined()
    }
  })

  it('maps field kinds to JSON types and drops the blank select option', () => {
    const pg = branchFor('postgres')
    expect(pg.properties.port).toEqual({ type: 'number', default: 5432 })
    expect(pg.properties.host).toEqual({ type: 'string' })
    expect(pg.properties.sslmode.enum).toEqual(['disable', 'require', 'verify-ca', 'verify-full'])
    expect(branchFor('redis').properties.tls).toMatchObject({ type: 'boolean', default: false })
  })

  it('offers an ssh block only for host/port adapters', () => {
    expect(branchFor('postgres').properties.ssh).toMatchObject({ type: 'object', required: ['host', 'user'] })
    expect(branchFor('redis').properties.ssh).toBeDefined()
    expect(branchFor('dynamodb').properties.ssh).toBeUndefined()
  })
})
