import { describe, expect, it, vi } from 'vitest'

let closeHandler: ((doc: unknown) => void) | undefined
vi.mock('vscode', () => ({
  workspace: {
    onDidCloseTextDocument: (fn: (doc: unknown) => void) => {
      closeHandler = fn
      return { dispose: () => (closeHandler = undefined) }
    },
  },
}))

import type { Memento } from 'vscode'
import { getFileConnection, registerUntitledBindingCleanup, resolveConnection, setFileConnection } from './fileConn'

function makeMemento(): Memento {
  const map = new Map<string, unknown>()
  return {
    keys: () => [...map.keys()],
    get: (k: string) => map.get(k),
    update: async (k: string, v: unknown) => {
      if (v === undefined) map.delete(k)
      else map.set(k, v)
    },
  } as Memento
}

describe('untitled binding cleanup', () => {
  it('drops the binding when an untitled doc closes', async () => {
    const state = makeMemento()
    const sub = registerUntitledBindingCleanup(state)
    await setFileConnection(state, 'Untitled-1', 'prod-redis')
    expect(getFileConnection(state, 'Untitled-1')).toBe('prod-redis')
    closeHandler!({ uri: { scheme: 'untitled', fsPath: 'Untitled-1' } })
    expect(getFileConnection(state, 'Untitled-1')).toBeUndefined()
    sub.dispose()
  })

  it('keeps bindings for saved files', async () => {
    const state = makeMemento()
    const sub = registerUntitledBindingCleanup(state)
    await setFileConnection(state, '/w/query.sql', 'local-pg')
    closeHandler!({ uri: { scheme: 'file', fsPath: '/w/query.sql' } })
    expect(getFileConnection(state, '/w/query.sql')).toBe('local-pg')
    sub.dispose()
  })
})

describe('resolveConnection', () => {
  it('honours a valid remembered binding', () => {
    expect(resolveConnection('pg', ['pg', 'dyn'])).toBe('pg')
  })

  it('auto-picks when exactly one connection matches', () => {
    expect(resolveConnection(undefined, ['pg'])).toBe('pg')
  })

  it('prompts (undefined) when several match and nothing is remembered', () => {
    expect(resolveConnection(undefined, ['pg', 'dyn'])).toBeUndefined()
  })

  it('ignores a remembered binding that is no longer available', () => {
    expect(resolveConnection('gone', ['pg', 'dyn'])).toBeUndefined()
    expect(resolveConnection('gone', ['pg'])).toBe('pg')
  })
})
