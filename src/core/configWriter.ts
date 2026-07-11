import { applyEdits, modify } from 'jsonc-parser'

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
