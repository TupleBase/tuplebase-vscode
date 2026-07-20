import type { AdapterPresentation } from '../types'
import { presentation as mysql } from '../mysql/presentation'

// MariaDB speaks the MySQL wire protocol. This presentation is an alias: its
// own picker entry and config id, backed by the mysql driver chunk.
export const presentation: AdapterPresentation = {
  ...mysql,
  id: 'mariadb',
  label: 'MariaDB',
  emoji: '🦭',
  iconFile: 'mariadb.svg',
}
