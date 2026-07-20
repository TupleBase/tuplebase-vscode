import { validate, withReadonly } from './connFormSpec'
import type { AdapterPresentation, Field } from '../adapters/types'

const vscode = acquireVsCodeApi()
const app = document.getElementById('app')!

// The host injects the adapter catalog (labels, cards, form fields) so this
// browser bundle never imports adapter runtime code.
// Matches PickerAdapter in ui/connFormPanel.ts — declared locally so the
// browser bundle never imports host code.
type PickerAdapter = AdapterPresentation & { iconUri?: string }

type Init = { adapters: PickerAdapter[] } & (
  | { mode: 'new' }
  | { mode: 'edit'; group: string; adapter: string; name: string; values: Record<string, unknown> }
)

let init: Init = { mode: 'new', adapters: [] }
try {
  init = JSON.parse(document.body.dataset.init || '{"mode":"new","adapters":[]}') as Init
} catch {
  // fall back to the new-connection flow
}

const META = new Map(init.adapters.map(a => [a.id, a]))
const fieldsFor = (adapter: string): Field[] => withReadonly(META.get(adapter)?.fields ?? [])

type State = { stage: 'pick' } | { stage: 'form'; adapter: string }
let state: State = init.mode === 'edit' ? { stage: 'form', adapter: init.adapter } : { stage: 'pick' }
let currentErrBox: HTMLElement | undefined

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
  for (const a of init.adapters) {
    const card = el('button', 'card')
    card.type = 'button'
    if (a.iconUri) {
      const img = el('img', 'card-icon')
      img.src = a.iconUri
      img.alt = ''
      card.appendChild(img)
    } else {
      card.appendChild(el('span', 'card-icon', a.emoji))
    }
    card.appendChild(el('span', 'card-label', a.label))
    card.appendChild(el('span', 'card-blurb', a.blurb))
    card.addEventListener('click', () => {
      state = { stage: 'form', adapter: a.id }
      render()
    })
    grid.appendChild(card)
  }
  app.appendChild(grid)
}

function inputFor(f: Field, initial: unknown): HTMLInputElement | HTMLSelectElement {
  if (f.kind === 'checkbox') {
    const cb = el('input')
    cb.type = 'checkbox'
    cb.dataset.key = f.key
    cb.dataset.kind = 'checkbox'
    cb.checked = initial !== undefined ? initial === true : f.default === true
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
    if (initial !== undefined) sel.value = String(initial)
    return sel
  }
  const inp = el('input')
  inp.type = f.kind === 'number' ? 'number' : 'text'
  inp.dataset.key = f.key
  inp.dataset.kind = f.kind
  const value = initial !== undefined ? initial : f.default
  if (value !== undefined) inp.value = String(value)
  return inp
}

function fieldRow(f: Field, initial: unknown): HTMLElement {
  const row = el('label', f.kind === 'checkbox' ? 'row row-check' : 'row')
  row.appendChild(el('span', 'row-label', f.required ? `${f.label} *` : f.label))
  row.appendChild(inputFor(f, initial))
  return row
}

// Password handling: the secret goes to the OS keychain (never the config file).
// The prompt-every-connect toggle stores nothing and re-asks on each connect.
function credentials(editing: boolean, promptEveryTime: boolean): HTMLElement {
  const box = el('div', 'creds')
  box.appendChild(el('div', 'creds-title', 'Password'))

  const pwRow = el('label', 'row')
  pwRow.appendChild(el('span', 'row-label', editing ? 'New password' : 'Password'))
  const pw = el('input')
  pw.type = 'password'
  pw.dataset.secret = 'password'
  pw.placeholder = editing ? 'leave blank to keep the current password' : 'optional — prompted on first connect if blank'
  pwRow.appendChild(pw)
  box.appendChild(pwRow)

  const promptRow = el('label', 'row row-check')
  promptRow.appendChild(el('span', 'row-label', 'Prompt every connect (don\'t store)'))
  const cb = el('input')
  cb.type = 'checkbox'
  cb.dataset.secret = 'promptEveryTime'
  cb.checked = promptEveryTime
  const sync = () => { pw.disabled = cb.checked }
  cb.addEventListener('change', sync)
  sync()
  promptRow.appendChild(cb)
  box.appendChild(promptRow)
  return box
}

function renderForm(adapter: string) {
  const editing = init.mode === 'edit' && init.adapter === adapter
  const prefill = editing ? (init as Extract<Init, { mode: 'edit' }>) : undefined
  const label = META.get(adapter)?.label ?? adapter

  if (!editing) {
    const back = el('button', 'link', '← Back')
    back.type = 'button'
    back.addEventListener('click', () => {
      state = { stage: 'pick' }
      render()
    })
    app.appendChild(back)
  }
  app.appendChild(el('h1', undefined, editing ? `Edit ${label} connection` : `New ${label} connection`))

  const form = el('form', 'form')
  form.appendChild(fieldRow({ key: 'name', label: 'Connection name', kind: 'text', required: true }, prefill?.name))
  for (const f of fieldsFor(adapter)) form.appendChild(fieldRow(f, prefill?.values[f.key]))
  if (META.get(adapter)?.passwordSecret) form.appendChild(credentials(editing, prefill?.values.promptPassword === true))

  const errBox = el('div', 'errors')
  errBox.hidden = true
  form.appendChild(errBox)
  currentErrBox = errBox

  const actions = el('div', 'actions')
  const cancel = el('button', 'secondary', 'Cancel')
  cancel.type = 'button'
  cancel.addEventListener('click', () => vscode.postMessage({ type: 'cancel' }))
  const submit = el('button', 'primary', editing ? 'Save' : 'Create')
  submit.type = 'submit'
  actions.appendChild(cancel)
  actions.appendChild(submit)
  form.appendChild(actions)

  form.addEventListener('submit', e => {
    e.preventDefault()
    const { name, values, secret } = collect(form)
    const errs = validate(fieldsFor(adapter), name, values)
    if (errs.length) {
      showErrors(errBox, errs)
      return
    }
    vscode.postMessage({ type: 'create', adapter, connName: name.trim(), values, secret })
  })
  app.appendChild(form)
}

interface SecretInput { password?: string; promptEveryTime?: boolean }

function collect(form: HTMLElement): { name: string; values: Record<string, unknown>; secret: SecretInput } {
  let name = ''
  const values: Record<string, unknown> = {}
  form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-key]').forEach(node => {
    const key = node.dataset.key!
    const value = node.dataset.kind === 'checkbox' ? (node as HTMLInputElement).checked : node.value
    if (key === 'name') name = String(value)
    else values[key] = value
  })
  const secret: SecretInput = {}
  form.querySelectorAll<HTMLInputElement>('[data-secret]').forEach(node => {
    if (node.dataset.secret === 'password') secret.password = node.value
    if (node.dataset.secret === 'promptEveryTime') secret.promptEveryTime = node.checked
  })
  return { name, values, secret }
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
