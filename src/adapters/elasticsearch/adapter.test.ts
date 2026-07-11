import { describe, expect, it } from 'vitest'
import { elasticsearchFactory, parseEs, esNodeId, parseEsNodeId } from './adapter'

describe('elasticsearchFactory.validate', () => {
  it('requires a host', () => {
    expect(elasticsearchFactory.validate({ adapter: 'elasticsearch' })).toEqual(['host is required'])
    expect(elasticsearchFactory.validate({ adapter: 'elasticsearch', host: 'localhost' })).toEqual([])
  })

  it('prompts for a password only when auth is enabled', () => {
    const base = { group: 'g', name: 'n', adapter: 'elasticsearch', readonly: false }
    expect(elasticsearchFactory.requiredSecrets({ ...base })).toEqual([])
    expect(elasticsearchFactory.requiredSecrets({ ...base, auth: true })).toEqual(['password'])
  })
})

describe('parseEs', () => {
  it('parses method, path and an optional JSON body', () => {
    expect(parseEs('GET /crew/_search {"query":{"match_all":{}}}')).toEqual({
      method: 'GET', path: '/crew/_search', body: { query: { match_all: {} } },
    })
    expect(parseEs('GET _cat/indices')).toEqual({ method: 'GET', path: '/_cat/indices', body: undefined })
  })

  it('rejects non-requests and invalid JSON bodies', () => {
    expect(() => parseEs('select 1')).toThrow(/expected <METHOD>/)
    expect(() => parseEs('GET /crew/_search {bad}')).toThrow(/valid JSON/)
  })
})

describe('esNodeId', () => {
  it('round-trips segments, preserving names that contain dots', () => {
    expect(parseEsNodeId(esNodeId('crew.2026', 'name'))).toEqual(['crew.2026', 'name'])
  })
})
