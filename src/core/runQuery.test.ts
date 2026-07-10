import { describe, expect, it, vi } from 'vitest'

const { FakeUri, windowMock, workspaceMock, handlers } = vi.hoisted(() => {
  class FakeUri {
    constructor(private s: string) {}
    get fsPath() {
      return this.s.replace('file://', '')
    }
    toString() {
      return this.s
    }
  }
  return {
    FakeUri,
    windowMock: {
      activeTextEditor: undefined as any,
      visibleTextEditors: [] as any[],
      showWarningMessage: vi.fn(),
      showErrorMessage: vi.fn(),
      showQuickPick: vi.fn(),
    },
    workspaceMock: { textDocuments: [] as any[] },
    handlers: { run: undefined as ((arg?: unknown) => Promise<void>) | undefined },
  }
})

vi.mock('vscode', () => ({
  EventEmitter: class {
    event = () => ({ dispose() {} })
    fire() {}
    dispose() {}
  },
  Uri: FakeUri,
  window: windowMock,
  workspace: workspaceMock,
  commands: {
    registerCommand: (id: string, fn: (arg?: unknown) => Promise<void>) => {
      if (id === 'rowboat.runQuery') handlers.run = fn
      return { dispose() {} }
    },
  },
  languages: { registerCodeLensProvider: () => ({ dispose() {} }) },
  Range: class {},
  CodeLens: class {},
  Disposable: { from: (...items: unknown[]) => ({ dispose() {}, items }) },
}))

import type { Memento } from 'vscode'
import type { ConnectionManager } from '../core/connections'
import type { ConfigStore } from '../core/configStore'
import type { ResultsPanel } from '../ui/resultsPanel'
import { registerRunQuery } from './runQuery'

function makeDoc(text: string, uriStr: string) {
  return {
    getText: (sel?: { start: number; end: number }) => (sel ? text.slice(sel.start, sel.end) : text),
    languageId: 'sql',
    uri: new FakeUri(uriStr),
    offsetAt: (pos: unknown) => pos as number,
  }
}

function makeEditor(doc: unknown, cursorOffset: number) {
  return { document: doc, selection: { isEmpty: true, active: cursorOffset } }
}

function setup(readonly = false) {
  const executed: string[] = []
  const adapter = {
    execute: async (stmt: string) => {
      executed.push(stmt)
      return { columns: [], rows: [], rowCount: 0, elapsedMs: 1, warnings: [] }
    },
  }
  const manager = {
    activeEnvironment: 'dev',
    factories: new Map([['postgres', { languageId: 'sql' }]]),
    getAdapter: async () => adapter,
  } as unknown as ConnectionManager
  const store = {
    connections: () => [{ env: 'dev', name: 'local-pg', adapter: 'postgres' }],
    isReadonly: () => readonly,
  } as unknown as ConfigStore
  const panel = {
    show: async () => {},
    post: () => {},
    onCancel: () => ({ dispose() {} }),
  } as unknown as ResultsPanel
  const memento = { get: () => 'local-pg', update: async () => {} } as unknown as Memento
  registerRunQuery(manager, store, panel, memento)
  return { executed }
}

describe('runQuery argument dispatch', () => {
  it('codelens {uri, offset} runs the statement at that offset in that document', async () => {
    const { executed } = setup()
    const text = 'select 1;\nselect 2'
    const doc = makeDoc(text, 'untitled:Untitled-1')
    workspaceMock.textDocuments = [doc]
    windowMock.activeTextEditor = makeEditor(makeDoc('select 9', 'file:///other.sql'), 0)
    await handlers.run!({ uri: new FakeUri('untitled:Untitled-1'), offset: text.indexOf('select 2') })
    expect(executed).toEqual(['select 2'])
  })

  it('a bare Uri (editor-title button) targets that editor, not the active one', async () => {
    const { executed } = setup()
    const clicked = makeEditor(makeDoc('select 42', 'file:///b.sql'), 0)
    windowMock.visibleTextEditors = [clicked]
    windowMock.activeTextEditor = makeEditor(makeDoc('select 1', 'file:///a.sql'), 0)
    await handlers.run!(new FakeUri('file:///b.sql'))
    expect(executed).toEqual(['select 42'])
  })

  it('no argument falls back to the active editor cursor', async () => {
    const { executed } = setup()
    windowMock.visibleTextEditors = []
    windowMock.activeTextEditor = makeEditor(makeDoc('select 7', 'file:///a.sql'), 0)
    await handlers.run!(undefined)
    expect(executed).toEqual(['select 7'])
  })

  it('blocks writes before opening a readonly environment connection', async () => {
    const { executed } = setup(true)
    windowMock.activeTextEditor = makeEditor(makeDoc('DELETE FROM crew', 'file:///prod.sql'), 0)
    await handlers.run!(undefined)
    expect(executed).toEqual([])
    expect(windowMock.showWarningMessage).toHaveBeenCalledWith(
      expect.stringMatching(/writes are blocked in readonly environment "dev"/),
    )
  })
})
