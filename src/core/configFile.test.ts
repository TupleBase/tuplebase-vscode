import { describe, expect, it } from 'vitest'
import { selectConfigFilename } from './configFile'

describe('selectConfigFilename', () => {
  it('prefers .tuplebase.json when both config files exist', () => {
    expect(selectConfigFilename(['.rowboat.json', '.tuplebase.json'])).toBe('.tuplebase.json')
  })

  it('accepts .rowboat.json during the migration window', () => {
    expect(selectConfigFilename(['README.md', '.rowboat.json'])).toBe('.rowboat.json')
  })

  it('returns undefined when the workspace has no config', () => {
    expect(selectConfigFilename(['README.md'])).toBeUndefined()
  })
})
