import { describe, expect, it, vi } from 'vitest'

vi.mock('vscode', () => ({
  Uri: {
    joinPath: (base: { path: string }, ...parts: string[]) => ({
      path: [base.path, ...parts].join('/'),
    }),
  },
  window: {},
  commands: { registerCommand: () => ({ dispose() {} }) },
  Disposable: { from: (...items: unknown[]) => ({ dispose() {}, items }) },
}))

import { pickerAdapters } from './connFormPanel'

const extensionUri = { path: '/ext' } as never
const webview = {
  asWebviewUri: (uri: { path: string }) => `https://webview${uri.path}`,
} as never

describe('pickerAdapters', () => {
  it('adds a webview iconUri for every enabled adapter with an iconFile', () => {
    const adapters = pickerAdapters(webview, extensionUri)
    expect(adapters.length).toBeGreaterThan(0)
    for (const a of adapters) {
      expect(a.iconUri).toBe(`https://webview/ext/dist/adapters/${a.id}/${a.id}.svg`)
    }
  })

  it('keeps the full presentation payload (fields drive the form)', () => {
    const pg = pickerAdapters(webview, extensionUri).find(a => a.id === 'postgres')
    expect(pg?.fields.length).toBeGreaterThan(0)
    expect(pg?.emoji).toBeTruthy()
  })
})
