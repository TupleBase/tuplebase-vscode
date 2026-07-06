import { describe, expect, it, vi } from 'vitest'

vi.mock('vscode', () => ({
  EventEmitter: class {
    event = () => ({ dispose() {} })
    fire() {}
    dispose() {}
  },
  Uri: { joinPath: (...parts: unknown[]) => parts.join('/') },
}))

import { ResultsPanel, ResultsMessage } from './resultsPanel'

const fakeView = (posted: ResultsMessage[]) => ({
  webview: {
    options: {},
    html: '',
    cspSource: '',
    asWebviewUri: (u: unknown) => u,
    onDidReceiveMessage: () => ({ dispose() {} }),
    postMessage: (m: ResultsMessage) => {
      posted.push(m)
      return Promise.resolve(true)
    },
  },
})

const errorMsg = (i: number): ResultsMessage => ({ type: 'error', message: `e${i}` })

describe('ResultsPanel pending queue', () => {
  it('flushes queued messages in order on resolve', () => {
    const panel = new ResultsPanel({} as never)
    panel.post({ type: 'running', statement: 's1' })
    panel.post(errorMsg(1))
    const posted: ResultsMessage[] = []
    panel.resolveWebviewView(fakeView(posted) as never)
    expect(posted).toEqual([{ type: 'running', statement: 's1' }, errorMsg(1)])
  })

  it('caps the queue at 20, dropping oldest', () => {
    const panel = new ResultsPanel({} as never)
    for (let i = 0; i < 25; i++) panel.post(errorMsg(i))
    const posted: ResultsMessage[] = []
    panel.resolveWebviewView(fakeView(posted) as never)
    expect(posted).toHaveLength(20)
    expect(posted[0]).toEqual(errorMsg(5))
    expect(posted[19]).toEqual(errorMsg(24))
  })

  it('posts directly once resolved, nothing re-flushed', () => {
    const panel = new ResultsPanel({} as never)
    const posted: ResultsMessage[] = []
    panel.resolveWebviewView(fakeView(posted) as never)
    panel.post(errorMsg(1))
    expect(posted).toEqual([errorMsg(1)])
  })
})
