// Pure state model for the results panel's per-statement tabs. The DOM wiring
// in results.ts owns rendering; this owns the data so it can be unit-tested.
export interface Envelope {
  columns: { name: string; type?: string }[]
  rows: unknown[][]
  rowCount: number
  elapsedMs: number
  warnings: string[]
}

export type Tab =
  | { status: 'pending' }
  | { status: 'running'; statement: string }
  | { status: 'done'; envelope: Envelope; statement: string }
  | { status: 'error'; message: string }

export type TabUpdate =
  | { type: 'running'; statement: string; index?: number }
  | { type: 'result'; envelope: Envelope; statement: string; index?: number }
  | { type: 'error'; message: string; index?: number }

// A batch of `total` statements starts as that many pending tabs (at least one).
export function initialTabs(total: number): Tab[] {
  return Array.from({ length: Math.max(1, total) }, () => ({ status: 'pending' }))
}

// Fold one running/result/error update into the tab at its index. Grows the
// array defensively if an index arrives without a preceding batch reset.
export function applyTabUpdate(tabs: Tab[], msg: TabUpdate): Tab[] {
  const i = msg.index ?? 0
  const next = tabs.slice()
  while (next.length <= i) next.push({ status: 'pending' })
  if (msg.type === 'running') next[i] = { status: 'running', statement: msg.statement }
  else if (msg.type === 'result') next[i] = { status: 'done', envelope: msg.envelope, statement: msg.statement }
  else next[i] = { status: 'error', message: msg.message }
  return next
}

export function tabLabel(tab: Tab, index: number): string {
  const n = String(index + 1)
  switch (tab.status) {
    case 'done':
      return `${n} · ${tab.envelope.rowCount}`
    case 'error':
      return `${n} · error`
    case 'running':
      return `${n} · …`
    default:
      return n
  }
}

const MAX_STATE_ROWS = 100
// Trim persisted state so a restored webview stays small; the grid re-runs for
// the full result set.
export function capTab(tab: Tab): Tab {
  if (tab.status !== 'done' || tab.envelope.rows.length <= MAX_STATE_ROWS) return tab
  return {
    ...tab,
    envelope: {
      ...tab.envelope,
      rows: tab.envelope.rows.slice(0, MAX_STATE_ROWS),
      warnings: [...tab.envelope.warnings, `state restored with first ${MAX_STATE_ROWS} rows — re-run for full results`],
    },
  }
}
