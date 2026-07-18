import { applyEdits, modify, parse } from 'jsonc-parser'

const OPTS = { formattingOptions: { insertSpaces: true, tabSize: 2 } }

// All writers preserve comments/formatting: jsonc-parser computes a minimal edit
// against the existing text rather than reserialising the document.
export function addGroup(text: string, name: string): string {
  return applyEdits(text, modify(text, ['groups', name], {}, OPTS))
}

export function addConnection(
  text: string,
  group: string,
  connName: string,
  conn: Record<string, unknown>,
): string {
  return applyEdits(text, modify(text, ['groups', group, connName], conn, OPTS))
}

export function deleteGroup(text: string, name: string): string {
  return applyEdits(text, modify(text, ['groups', name], undefined, OPTS))
}

export function removeConnection(text: string, group: string, connName: string): string {
  return applyEdits(text, modify(text, ['groups', group, connName], undefined, OPTS))
}

// Renaming a key isn't a single jsonc edit — drop the old key and re-add the value
// under the new name. Comments *inside* the group are not carried over.
export function renameGroup(text: string, oldName: string, newName: string): string {
  const value = parse(text)?.groups?.[oldName] ?? {}
  const dropped = applyEdits(text, modify(text, ['groups', oldName], undefined, OPTS))
  return applyEdits(dropped, modify(dropped, ['groups', newName], value, OPTS))
}

export function moveConnection(text: string, fromGroup: string, toGroup: string, connName: string): string {
  const conn = parse(text)?.groups?.[fromGroup]?.[connName]
  if (conn === undefined) return text
  const dropped = applyEdits(text, modify(text, ['groups', fromGroup, connName], undefined, OPTS))
  return applyEdits(dropped, modify(dropped, ['groups', toGroup, connName], conn, OPTS))
}
