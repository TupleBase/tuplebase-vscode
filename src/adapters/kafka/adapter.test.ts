import { describe, expect, it } from 'vitest'
import { kafkaFactory, kfNodeId, parseKfNodeId } from './adapter'

describe('kafkaFactory.validate', () => {
  it('requires a host', () => {
    expect(kafkaFactory.validate({ adapter: 'kafka' })).toEqual(['host is required'])
    expect(kafkaFactory.validate({ adapter: 'kafka', host: 'localhost' })).toEqual([])
  })

  it('needs no secrets', () => {
    expect(kafkaFactory.requiredSecrets({ group: 'g', name: 'n', adapter: 'kafka', readonly: false })).toEqual([])
  })
})

describe('kfNodeId', () => {
  it('round-trips segments, preserving names that contain dots', () => {
    expect(parseKfNodeId(kfNodeId('orders.v2', '0'))).toEqual(['orders.v2', '0'])
  })
})
