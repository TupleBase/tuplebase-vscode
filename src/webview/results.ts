import { TabulatorFull as Tabulator } from 'tabulator-tables'
import { formatRow, rowToHtml } from './detailJson'
import { applyTabUpdate, capTab, initialTabs, tabLabel, type Envelope, type Tab } from './tabsModel'

type Incoming =
  | { type: 'batch'; total: number }
  | { type: 'running'; statement: string; index?: number }
  | { type: 'result'; envelope: Envelope; statement: string; index?: number }
  | { type: 'error'; message: string; index?: number }

const vscode = acquireVsCodeApi<{ tabs?: Tab[]; active?: number }>()
const status = document.getElementById('status')!
const cancelBtn = document.getElementById('cancel') as HTMLButtonElement
const tabStrip = document.getElementById('tabs') as HTMLDivElement
const detail = document.getElementById('detail') as HTMLDivElement
const detailJson = document.getElementById('detail-json')!
const detailClose = document.getElementById('detail-close') as HTMLButtonElement
const detailCopy = document.getElementById('detail-copy') as HTMLButtonElement
let detailText = ''

let tabs: Tab[] = []
let active = 0
let table: Tabulator | undefined

cancelBtn.addEventListener('click', () => vscode.postMessage({ type: 'cancel' }))
detailClose.addEventListener('click', hideDetail)
detailCopy.addEventListener('click', () => {
  vscode.postMessage({ type: 'copy', text: detailText })
  detailCopy.textContent = 'Copied'
  setTimeout(() => { detailCopy.textContent = 'Copy' }, 1200)
})

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

function hideDetail() {
  if (detail.hidden) return
  detail.hidden = true
  table?.redraw()
}

function destroyTable() {
  table?.destroy()
  table = undefined
}

function buildTable(envelope: Envelope) {
  const columns = envelope.columns.map((c, i) => ({
    title: escapeHtml(c.name),
    field: `c${i}`,
    formatter: (cell: { getValue(): unknown }) => {
      const v = cell.getValue()
      return v === null || v === undefined ? '<span class="null">NULL</span>' : escapeHtml(String(v))
    },
  }))
  const data = envelope.rows.map(r => Object.fromEntries(r.map((v, i) => [`c${i}`, v])))
  destroyTable()
  table = new Tabulator('#grid', { data, columns, height: '100%', layout: 'fitDataStretch' })
  table.on('rowClick', (_e, row) => {
    const rowData = row.getData() as Record<string, unknown>
    const values = envelope.columns.map((_c, i) => rowData[`c${i}`])
    detailText = formatRow(envelope.columns, values)
    detailJson.innerHTML = rowToHtml(envelope.columns, values)
    detail.hidden = false
    table?.redraw()
  })
}

function renderStrip() {
  cancelBtn.hidden = !tabs.some(t => t.status === 'running')
  tabStrip.hidden = tabs.length <= 1
  tabStrip.textContent = ''
  tabs.forEach((tab, i) => {
    const btn = document.createElement('button')
    btn.className = i === active ? 'tab active' : 'tab'
    btn.textContent = tabLabel(tab, i)
    btn.addEventListener('click', () => {
      if (i === active) return
      active = i
      hideDetail()
      renderStrip()
      renderActive()
      persist()
    })
    tabStrip.appendChild(btn)
  })
}

function renderActive() {
  const tab = tabs[active]
  if (!tab || tab.status === 'pending') {
    status.textContent = 'Running…'
    destroyTable()
    return
  }
  if (tab.status === 'running') {
    status.textContent = `Running: ${tab.statement.slice(0, 120)}…`
    destroyTable()
    return
  }
  if (tab.status === 'error') {
    status.textContent = tab.message
    destroyTable()
    return
  }
  const { envelope } = tab
  const warn = envelope.warnings.length ? ` — ${envelope.warnings.join('; ')}` : ''
  status.textContent = `${envelope.rowCount} rows in ${envelope.elapsedMs}ms${warn}`
  buildTable(envelope)
}

function persist() {
  vscode.setState({ tabs: tabs.map(capTab), active })
}

function onMessage(msg: Incoming) {
  if (msg.type === 'batch') {
    tabs = initialTabs(msg.total)
    active = 0
    hideDetail()
    renderStrip()
    renderActive()
    persist()
    return
  }
  tabs = applyTabUpdate(tabs, msg)
  renderStrip()
  if ((msg.index ?? 0) === active) renderActive()
  persist()
}

window.addEventListener('message', e => onMessage(e.data as Incoming))

const prior = vscode.getState()
if (prior?.tabs?.length) {
  tabs = prior.tabs
  active = Math.min(prior.active ?? 0, tabs.length - 1)
  renderStrip()
  renderActive()
}

declare function acquireVsCodeApi<T>(): {
  postMessage(msg: unknown): void
  getState(): T | undefined
  setState(s: T): void
}
