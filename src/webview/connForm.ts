import { ADAPTERS, fieldsFor, validate, type Field } from './connFormSpec'

const vscode = acquireVsCodeApi()
const app = document.getElementById('app')!

type State = { stage: 'pick' } | { stage: 'form'; adapter: string }
let state: State = { stage: 'pick' }
let currentErrBox: HTMLElement | undefined

const META: Record<string, { label: string; icon: string; blurb: string }> = {
  postgres: { label: 'PostgreSQL', icon: '🐘', blurb: 'Relational · SQL' },
  redis: { label: 'Redis', icon: '⚡', blurb: 'Key-value · commands' },
  dynamodb: { label: 'DynamoDB', icon: '🟧', blurb: 'AWS · PartiQL' },
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (text !== undefined) n.textContent = text
  return n
}

function render() {
  app.textContent = ''
  currentErrBox = undefined
  if (state.stage === 'pick') renderPick()
  else renderForm(state.adapter)
}

function renderPick() {
  app.appendChild(el('h1', undefined, 'New connection'))
  app.appendChild(el('p', 'subtitle', 'Choose a database type'))
  const grid = el('div', 'cards')
  for (const adapter of ADAPTERS) {
    const m = META[adapter]
    const card = el('button', 'card')
    card.type = 'button'
    card.appendChild(el('span', 'card-icon', m.icon))
    card.appendChild(el('span', 'card-label', m.label))
    card.appendChild(el('span', 'card-blurb', m.blurb))
    card.addEventListener('click', () => {
      state = { stage: 'form', adapter }
      render()
    })
    grid.appendChild(card)
  }
  app.appendChild(grid)
}

function inputFor(f: Field): HTMLInputElement | HTMLSelectElement {
  if (f.kind === 'checkbox') {
    const cb = el('input')
    cb.type = 'checkbox'
    cb.dataset.key = f.key
    cb.dataset.kind = 'checkbox'
    if (f.default === true) cb.checked = true
    return cb
  }
  if (f.kind === 'select') {
    const sel = el('select')
    sel.dataset.key = f.key
    sel.dataset.kind = 'select'
    for (const o of f.options ?? []) {
      const opt = el('option', undefined, o || '(default)')
      opt.value = o
      sel.appendChild(opt)
    }
    return sel
  }
  const inp = el('input')
  inp.type = f.kind === 'number' ? 'number' : 'text'
  inp.dataset.key = f.key
  inp.dataset.kind = f.kind
  if (f.default !== undefined) inp.value = String(f.default)
  return inp
}

function fieldRow(f: Field): HTMLElement {
  const row = el('label', f.kind === 'checkbox' ? 'row row-check' : 'row')
  row.appendChild(el('span', 'row-label', f.required ? `${f.label} *` : f.label))
  row.appendChild(inputFor(f))
  return row
}

function renderForm(adapter: string) {
  const m = META[adapter]
  const back = el('button', 'link', '← Back')
  back.type = 'button'
  back.addEventListener('click', () => {
    state = { stage: 'pick' }
    render()
  })
  app.appendChild(back)
  app.appendChild(el('h1', undefined, `New ${m.label} connection`))

  const form = el('form', 'form')
  form.appendChild(fieldRow({ key: 'name', label: 'Connection name', kind: 'text', required: true }))
  for (const f of fieldsFor(adapter)) form.appendChild(fieldRow(f))

  const errBox = el('div', 'errors')
  errBox.hidden = true
  form.appendChild(errBox)
  currentErrBox = errBox

  const actions = el('div', 'actions')
  const cancel = el('button', 'secondary', 'Cancel')
  cancel.type = 'button'
  cancel.addEventListener('click', () => vscode.postMessage({ type: 'cancel' }))
  const create = el('button', 'primary', 'Create')
  create.type = 'submit'
  actions.appendChild(cancel)
  actions.appendChild(create)
  form.appendChild(actions)

  form.addEventListener('submit', e => {
    e.preventDefault()
    const { name, values } = collect(form)
    const errs = validate(adapter, name, values)
    if (errs.length) {
      showErrors(errBox, errs)
      return
    }
    vscode.postMessage({ type: 'create', adapter, connName: name.trim(), values })
  })
  app.appendChild(form)
}

function collect(form: HTMLElement): { name: string; values: Record<string, unknown> } {
  let name = ''
  const values: Record<string, unknown> = {}
  form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-key]').forEach(node => {
    const key = node.dataset.key!
    const value = node.dataset.kind === 'checkbox' ? (node as HTMLInputElement).checked : node.value
    if (key === 'name') name = String(value)
    else values[key] = value
  })
  return { name, values }
}

function showErrors(box: HTMLElement, errs: string[]) {
  box.textContent = ''
  for (const e of errs) box.appendChild(el('div', 'error', e))
  box.hidden = false
}

window.addEventListener('message', e => {
  const msg = e.data as { type?: string; errors?: string[]; message?: string }
  if (msg?.type === 'error' && currentErrBox) {
    showErrors(currentErrBox, Array.isArray(msg.errors) ? msg.errors : [msg.message ?? 'Error'])
  }
})

render()

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void
  getState(): unknown
  setState(s: unknown): void
}
