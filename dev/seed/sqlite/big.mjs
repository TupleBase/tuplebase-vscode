// Large dataset for exercising results paging / grid volume.
// Rewrites dev/seed/sqlite/demo.sqlite with a pagination_demo table added.
// Runs as the second half of the standard seed: `npm run db:seed -- sqlite`
import initSqlJs from 'sql.js/dist/sql-asm.js'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const file = join(here, 'demo.sqlite')
const SQL = await initSqlJs()
const db = existsSync(file) ? new SQL.Database(readFileSync(file)) : new SQL.Database()

db.run(`
  DROP TABLE IF EXISTS pagination_demo;
  CREATE TABLE pagination_demo (
    id integer PRIMARY KEY,
    label text NOT NULL,
    bucket integer NOT NULL,
    amount numeric NOT NULL,
    created_at text NOT NULL
  );
  WITH RECURSIVE seq (n) AS (
    SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 10000
  )
  INSERT INTO pagination_demo (id, label, bucket, amount, created_at)
  SELECT n, 'row-' || n, n % 50, (n * 7) % 1000, datetime('now', '-' || n || ' minutes')
  FROM seq;
`)

writeFileSync(file, Buffer.from(db.export()))
db.close()
console.log(`seeded sqlite big: pagination_demo (10000 rows) in ${file}`)
