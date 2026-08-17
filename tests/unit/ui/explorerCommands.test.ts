import { describe, expect, it, vi } from 'vitest'

vi.mock('vscode', () => ({}))

import { cleanupRemovedConnections } from '../../../src/ui/explorerCommands'

describe('cleanupRemovedConnections', () => {
  it('disconnects sessions and deletes every connection secret namespace', async () => {
    const forgotten: string[] = []
    const errors = await cleanupRemovedConnections(
      ['one', 'two'],
      { forgetSecrets: async name => { forgotten.push(name) } },
    )
    expect(errors).toEqual([])
    expect(forgotten).toEqual(['one', 'two'])
  })

  it('continues cleaning siblings when one connection fails', async () => {
    const forgotten: string[] = []
    const errors = await cleanupRemovedConnections(
      ['bad', 'good'],
      { forgetSecrets: async name => {
        if (name === 'bad') throw new Error('close failed')
        forgotten.push(name)
      } },
    )
    expect(errors).toHaveLength(1)
    expect(forgotten).toEqual(['good'])
  })
})
