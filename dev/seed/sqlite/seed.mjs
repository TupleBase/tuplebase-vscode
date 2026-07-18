// Build the dev SQLite demo file from seed.sql using sql.js — no sqlite3 CLI
// needed. Run via `npm run db:seed -- sqlite`; writes dev/seed/sqlite/demo.sqlite.
import initSqlJs from 'sql.js/dist/sql-asm.js'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const SQL = await initSqlJs()
const db = new SQL.Database()
db.run(readFileSync(join(here, 'seed.sql'), 'utf8'))
const out = join(here, 'demo.sqlite')
writeFileSync(out, Buffer.from(db.export()))
db.close()
console.log(`wrote ${out}`)
