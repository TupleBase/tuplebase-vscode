import { describe, expect, it } from 'vitest'
import { applyTabUpdate, capTab, initialTabs, tabLabel, type Envelope, type Tab } from './tabsModel'

const env = (rowCount: number, rows: unknown[][] = []): Envelope => ({
  columns: [{ name: 'c' }],
  rows,
  rowCount,
  elapsedMs: 5,
  warnings: [],
})

describe('initialTabs', () => {
  it('creates one pending tab per statement', () => {
    expect(initialTabs(3)).toEqual([{ status: 'pending' }, { status: 'pending' }, { status: 'pending' }])
  })

  it('never returns zero tabs', () => {
    expect(initialTabs(0)).toEqual([{ status: 'pending' }])
  })
})

describe('applyTabUpdate', () => {
  it('marks a tab running/done by index without touching siblings', () => {
    let tabs = initialTabs(2)
    tabs = applyTabUpdate(tabs, { type: 'running', statement: 'select 2', index: 1 })
    tabs = applyTabUpdate(tabs, { type: 'result', envelope: env(7), statement: 'select 2', index: 1 })
    expect(tabs[0]).toEqual({ status: 'pending' })
    expect(tabs[1]).toEqual({ status: 'done', envelope: env(7), statement: 'select 2' })
  })

  it('defaults a missing index to 0 (single-statement run)', () => {
    const tabs = applyTabUpdate(initialTabs(1), { type: 'error', message: 'Cancelled' })
    expect(tabs[0]).toEqual({ status: 'error', message: 'Cancelled' })
  })

  it('grows defensively when an index arrives past the end', () => {
    const tabs = applyTabUpdate(initialTabs(1), { type: 'result', envelope: env(1), statement: 's', index: 2 })
    expect(tabs).toHaveLength(3)
    expect(tabs[2].status).toBe('done')
  })

  it('does not mutate the input array', () => {
    const tabs = initialTabs(1)
    applyTabUpdate(tabs, { type: 'running', statement: 's' })
    expect(tabs).toEqual([{ status: 'pending' }])
  })
})

describe('tabLabel', () => {
  it('labels by 1-based position and status', () => {
    expect(tabLabel({ status: 'pending' }, 0)).toBe('1')
    expect(tabLabel({ status: 'running', statement: 's' }, 1)).toBe('2 · …')
    expect(tabLabel({ status: 'done', envelope: env(42), statement: 's' }, 2)).toBe('3 · 42')
    expect(tabLabel({ status: 'error', message: 'x' }, 3)).toBe('4 · error')
  })
})

describe('capTab', () => {
  it('leaves small and non-done tabs untouched', () => {
    const running: Tab = { status: 'running', statement: 's' }
    expect(capTab(running)).toBe(running)
    const small: Tab = { status: 'done', envelope: env(2, [[1], [2]]), statement: 's' }
    expect(capTab(small)).toBe(small)
  })

  it('trims a large result to 100 rows and warns', () => {
    const rows = Array.from({ length: 250 }, (_, i) => [i])
    const capped = capTab({ status: 'done', envelope: env(250, rows), statement: 's' })
    if (capped.status !== 'done') throw new Error('expected done')
    expect(capped.envelope.rows).toHaveLength(100)
    expect(capped.envelope.warnings.at(-1)).toMatch(/first 100 rows/)
  })
})
