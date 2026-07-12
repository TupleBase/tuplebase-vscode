import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  filenames: [] as string[],
  readFile: vi.fn(),
}))

vi.mock('vscode', () => {
  class EventEmitter {
    readonly event = vi.fn()
    fire() {}
    dispose() {}
  }
  const watcher = {
    onDidChange: vi.fn(),
    onDidCreate: vi.fn(),
    onDidDelete: vi.fn(),
    dispose: vi.fn(),
  }
  return {
    EventEmitter,
    Uri: {
      joinPath: (base: { fsPath: string }, ...parts: string[]) => ({
        fsPath: [base.fsPath, ...parts].join('/'),
      }),
    },
    workspace: {
      workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
      createFileSystemWatcher: vi.fn(() => watcher),
      fs: {
        readDirectory: vi.fn(async () => mocks.filenames.map(name => [name, 1])),
        readFile: mocks.readFile,
      },
    },
    commands: { executeCommand: vi.fn(async () => undefined) },
    Diagnostic: class {},
    Range: class {},
    DiagnosticSeverity: { Error: 0 },
  }
})

import { ConfigStore } from './configStore'

const EMPTY_CONFIG = Buffer.from('{"version":1,"groups":{}}')
const diagnostics = () => ({ set: vi.fn(), clear: vi.fn() })

describe('ConfigStore', () => {
  beforeEach(() => {
    mocks.filenames = []
    mocks.readFile.mockReset().mockResolvedValue(EMPTY_CONFIG)
  })

  it('loads .tuplebase.json', async () => {
    mocks.filenames = ['.tuplebase.json']
    const store = new ConfigStore(diagnostics() as never)
    await store.load()

    expect(store.configUri?.fsPath).toBe('/workspace/.tuplebase.json')
    store.dispose()
  })

  it('has no config when the workspace has none', async () => {
    mocks.filenames = []
    const store = new ConfigStore(diagnostics() as never)
    await store.load()

    expect(store.configUri).toBeUndefined()
    expect(store.config).toBeUndefined()
    store.dispose()
  })
})
