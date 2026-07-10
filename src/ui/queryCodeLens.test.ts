import { describe, expect, it, vi } from 'vitest'

vi.mock('vscode', () => ({
  EventEmitter: class {
    private listeners = new Set<(v: unknown) => void>()
    event = (fn: (v: unknown) => void) => {
      this.listeners.add(fn)
      return { dispose: () => this.listeners.delete(fn) }
    }
    fire(v?: unknown) {
      for (const fn of this.listeners) fn(v)
    }
    dispose() {}
  },
  Range: class {
    constructor(public start: unknown, public end: unknown) {}
  },
  CodeLens: class {
    constructor(public range: unknown, public command?: { title: string; command: string; arguments?: unknown[] }) {}
  },
  languages: { registerCodeLensProvider: () => ({ dispose() {} }) },
  commands: { registerCommand: () => ({ dispose() {} }) },
  window: {},
  workspace: {},
  Disposable: { from: (...items: unknown[]) => ({ dispose() {}, items }) },
}))

import type { Memento, TextDocument } from 'vscode'
import type { ConnectionManager } from '../core/connections'
import type { ConfigStore } from '../core/configStore'
import { buildQueryCodeLenses } from './queryCodeLens'

// real positionAt semantics — the anchor bug (lens above the previous
// statement's line) is invisible with a stub that always returns line 0
function fakeDoc(text: string, languageId: string): TextDocument {
  return {
    getText: () => text,
    languageId,
    uri: { fsPath: '/w/q.' + languageId, toString: () => 'file:///w/q.' + languageId },
    positionAt: (offset: number) => {
      const before = text.slice(0, offset).split('\n')
      return { line: before.length - 1, character: before[before.length - 1].length }
    },
  } as unknown as TextDocument
}

function makeState(bound?: string): Memento {
  return {
    get: () => bound,
    update: async () => {},
  } as unknown as Memento
}

const manager = {
  activeEnvironment: 'dev',
  factories: new Map([['postgres', { languageId: 'sql' }]]),
  isConnected: () => false,
} as unknown as ConnectionManager

const store = {
  connections: () => [{ env: 'dev', name: 'local-pg', adapter: 'postgres' }],
} as unknown as ConfigStore

type Lens = { range: { start: { line: number } }; command?: { title: string; command: string; arguments?: any[] } }

describe('buildQueryCodeLenses', () => {
  it('emits a Run lens and a connection lens per statement, passing the statement offset', () => {
    const text = 'select 1; select 2'
    const doc = fakeDoc(text, 'sql')
    const lenses = buildQueryCodeLenses(doc, makeState('local-pg'), manager, store) as unknown as Lens[]
    expect(lenses).toHaveLength(4)
    expect(lenses[0].command?.title).toBe('▶ Run')
    expect(lenses[0].command?.command).toBe('rowboat.runQuery')
    expect(lenses[0].command?.arguments?.[0]).toMatchObject({ offset: 0 })
    expect(lenses[1].command?.title).toBe('$(circle-outline) local-pg')
    expect(lenses[1].command?.command).toBe('rowboat.selectConnectionForFile')
    expect(lenses[2].command?.arguments?.[0]).toMatchObject({ offset: text.indexOf('select 2') })
  })

  it('anchors each lens on its own statement line, not the previous line', () => {
    const text = 'select 1;\nselect 2;\n\nselect 3'
    const doc = fakeDoc(text, 'sql')
    const lenses = buildQueryCodeLenses(doc, makeState('local-pg'), manager, store) as unknown as Lens[]
    expect(lenses.map(l => l.range.start.line)).toEqual([0, 0, 1, 1, 3, 3])
  })

  it('offers to select a connection when the file is unbound', () => {
    const doc = fakeDoc('select 1', 'sql')
    const lenses = buildQueryCodeLenses(doc, makeState(undefined), manager, store) as unknown as Lens[]
    expect(lenses).toHaveLength(2)
    expect(lenses[1].command?.title).toBe('select connection…')
  })

  it('skips comment-only sql segments', () => {
    const doc = fakeDoc('select 1;\n-- todo: cleanup\n/* block */', 'sql')
    const lenses = buildQueryCodeLenses(doc, makeState('local-pg'), manager, store) as unknown as Lens[]
    expect(lenses).toHaveLength(2)
    expect(lenses[0].range.start.line).toBe(0)
  })

  it('splits redis files by command lines', () => {
    const text = 'GET a\nSET b 1'
    const doc = fakeDoc(text, 'redis')
    const lenses = buildQueryCodeLenses(doc, makeState('cache'), manager, store) as unknown as Lens[]
    expect(lenses).toHaveLength(4)
    expect(lenses[2].command?.arguments?.[0]).toMatchObject({ offset: text.indexOf('SET b 1') })
    expect(lenses[2].range.start.line).toBe(1)
  })
})
