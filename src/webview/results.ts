import { TabulatorFull as Tabulator } from 'tabulator-tables'

type Envelope = {
  columns: { name: string; type?: string }[]
  rows: unknown[][]
  rowCount: number
  elapsedMs: number
  warnings: string[]
}
type Incoming =
  | { type: 'running'; statement: string }
  | { type: 'result'; envelope: Envelope; statement: string }
  | { type: 'error'; message: string }

const vscode = acquireVsCodeApi<{ last?: Incoming }>()
const status = document.getElementById('status')!
const cancelBtn = document.getElementById('cancel') as HTMLButtonElement
let table: Tabulator | undefined

cancelBtn.addEventListener('click', () => vscode.postMessage({ type: 'cancel' }))

function render(msg: Incoming) {
  if (msg.type === 'running') {
    status.textContent = `Running: ${msg.statement.slice(0, 120)}…`
    cancelBtn.hidden = false
    return
  }
  cancelBtn.hidden = true
  if (msg.type === 'error') {
    status.textContent = msg.message
    table?.destroy()
    table = undefined
    return
  }
  const { envelope } = msg
  const warn = envelope.warnings.length ? ` — ${envelope.warnings.join('; ')}` : ''
  status.textContent = `${envelope.rowCount} rows in ${envelope.elapsedMs}ms${warn}`
  const columns = envelope.columns.map((c, i) => ({
    title: c.name,
    field: `c${i}`,
    formatter: (cell: { getValue(): unknown }) => {
      const v = cell.getValue()
      return v === null || v === undefined ? '<span class="null">NULL</span>' : String(v)
    },
  }))
  const data = envelope.rows.map(r => Object.fromEntries(r.map((v, i) => [`c${i}`, v])))
  table?.destroy()
  table = new Tabulator('#grid', {
    data,
    columns,
    height: '100%',
    layout: 'fitDataStretch',
  })
  vscode.setState({ last: msg })
}

window.addEventListener('message', e => render(e.data as Incoming))
const prior = vscode.getState()?.last
if (prior) render(prior)

declare function acquireVsCodeApi<T>(): {
  postMessage(msg: unknown): void
  getState(): T | undefined
  setState(s: T): void
}
