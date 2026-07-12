import { describe, expect, it } from 'vitest'
import { selectConfigFilename } from './configFile'

describe('selectConfigFilename', () => {
  it('finds .tuplebase.json among other files', () => {
    expect(selectConfigFilename(['README.md', '.tuplebase.json'])).toBe('.tuplebase.json')
  })

  it('returns undefined when the workspace has no config', () => {
    expect(selectConfigFilename(['README.md'])).toBeUndefined()
  })
})
