import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  filenames: [] as string[],
  acceptMigration: false,
  readFile: vi.fn(),
  rename: vi.fn(),
  showInformationMessage: vi.fn(),
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
        rename: mocks.rename,
      },
    },
    commands: { executeCommand: vi.fn(async () => undefined) },
    window: { showInformationMessage: mocks.showInformationMessage },
    Diagnostic: class {},
    Range: class {},
    DiagnosticSeverity: { Error: 0 },
  }
})

import { ConfigStore } from './configStore'

const EMPTY_CONFIG = Buffer.from('{"version":1,"groups":{}}')
const diagnostics = () => ({ set: vi.fn(), clear: vi.fn() })

describe('ConfigStore config filename migration', () => {
  beforeEach(() => {
    mocks.filenames = []
    mocks.acceptMigration = false
    mocks.readFile.mockReset().mockResolvedValue(EMPTY_CONFIG)
    mocks.rename.mockReset().mockResolvedValue(undefined)
    mocks.showInformationMessage.mockReset().mockImplementation(async (_message, action) =>
      mocks.acceptMigration ? action : undefined,
    )
  })

  it('loads .tuplebase.json without offering migration', async () => {
    mocks.filenames = ['.rowboat.json', '.tuplebase.json']
    const store = new ConfigStore(diagnostics() as never)
    await store.load()

    expect(store.configUri?.fsPath).toBe('/workspace/.tuplebase.json')
    expect(mocks.showInformationMessage).not.toHaveBeenCalled()
    store.dispose()
  })

  it('loads .rowboat.json and offers an explicit rename', async () => {
    mocks.filenames = ['.rowboat.json']
    const store = new ConfigStore(diagnostics() as never)
    await store.load()

    expect(store.configUri?.fsPath).toBe('/workspace/.rowboat.json')
    expect(mocks.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('.rowboat.json is deprecated'),
      'Rename to .tuplebase.json',
    )
    expect(mocks.rename).not.toHaveBeenCalled()
    store.dispose()
  })

  it('renames the legacy config only after confirmation', async () => {
    mocks.filenames = ['.rowboat.json']
    mocks.acceptMigration = true
    const store = new ConfigStore(diagnostics() as never)
    await store.load()

    await vi.waitFor(() => expect(mocks.rename).toHaveBeenCalledWith(
      { fsPath: '/workspace/.rowboat.json' },
      { fsPath: '/workspace/.tuplebase.json' },
      { overwrite: false },
    ))
    store.dispose()
  })
})
