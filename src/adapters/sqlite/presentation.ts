import type { AdapterPresentation } from '../types'
import { SQL_WRITE_KEYWORDS } from '../sqlWriteKeywords'

export const presentation: AdapterPresentation = {
  id: 'sqlite',
  label: 'SQLite',
  codicon: 'database',
  emoji: '🪶',
  blurb: 'Relational · SQL · file',
  iconFile: 'sqlite.svg',
  languageId: 'sql',
  statementSyntax: 'sql',
  completionTriggers: ['.', ' ', '"'],
  // file-based: no host/port/user, so no password secret and no SSH tunnel
  writeRule: { mode: 'firstKeywordIn', keywords: SQL_WRITE_KEYWORDS },
  fields: [
    {
      key: 'path',
      label: 'File path',
      kind: 'text',
      required: true,
      description: 'Path to the SQLite database file — absolute, or relative to the .rowboat.json location; ${env:VAR} is interpolated.',
    },
  ],
}
