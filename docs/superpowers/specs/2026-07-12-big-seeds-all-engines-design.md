# Big seeds for all engines — design

**Date:** 2026-07-12
**Status:** approved

## Goal

`npm run db:seed:big` today covers only postgres, redis, and dynamo. Extend the
opt-in high-volume paging dataset to the 10 remaining engines so every
adapter's results-grid paging path can be exercised with real volume:
mysql, mariadb, sqlite, clickhouse, mssql, cassandra, neo4j, mongodb,
elasticsearch, kafka.

## Approach

Follow the existing per-engine convention exactly (approach A of three
considered; a shared generator was rejected because the shared core is ~5
lines while connection code differs per engine):

- Engines whose image ships a CLI get a `big.sql` piped through
  `docker compose exec -T`, like postgres does with psql.
- Script-seeded engines get a `big.mjs` next to their existing `seed.mjs`,
  reusing its driver and connection boilerplate.
- All register in the `BIG` table in `dev/db.mjs`.

No new dependencies: every driver needed is already used by the normal seeds.

## Per-engine plan

| Engine | File | Mechanism | Rows |
|---|---|---|---|
| mysql | `dev/seed/mysql/big.sql` | pipe via `compose exec -T mysql mysql -urowboat -prowboat rowboat`; recursive CTE with `SET SESSION cte_max_recursion_depth = 10000` | 10 000 |
| mariadb | `dev/seed/mariadb/big.sql` | pipe via mariadb client; `seq_1_to_10000` sequence engine (no CTE depth knob) | 10 000 |
| clickhouse | `dev/seed/clickhouse/big.sql` | pipe via `compose exec -T clickhouse clickhouse-client -d rowboat --multiquery`; MergeTree table filled `FROM numbers(10000)` | 10 000 |
| sqlite | `dev/seed/sqlite/big.mjs` | sql.js opens the existing `demo.sqlite`, drops/recreates the table, rewrites the file | 10 000 |
| mssql | `dev/seed/mssql/big.mjs` | `mssql` driver, same creds as `seed.mjs`; INSERT batches of 1000 (T-SQL row-VALUES limit) | 10 000 |
| cassandra | `dev/seed/cassandra/big.mjs` | prepared inserts in small concurrent batches | 2 000 |
| neo4j | `dev/seed/neo4j/big.mjs` | `UNWIND $rows CREATE (:PageDemo …)` in chunks | 10 000 |
| mongodb | `dev/seed/mongodb/big.mjs` | drop collection + `insertMany` | 10 000 |
| elasticsearch | `dev/seed/elasticsearch/big.mjs` | wait-for-ready loop like `seed.mjs`, recreate index, `bulk` in chunks of 1000, refresh at end | 10 000 |
| kafka | `dev/seed/kafka/big.mjs` | recreate `pagedemo` topic with 1 partition (linear offsets make paging deterministic), produce JSON messages in chunks | 5 000 |

Row counts follow the existing precedents: 10k matches postgres, 5k matches
redis, 2k matches dynamo (batch-write cost).

## Data shape

Uniform across engines, matching postgres/dynamo: object named
`pagination_demo` (table / collection / index / topic; Neo4j uses the
`:PageDemo` label), with fields:

- `id` — 1..N (dynamo-style string ids where the store is keyed by string)
- `label` — `row-N`
- `bucket` — `N % 50`
- `amount` — deterministic `(N * 7) % 1000`
- `created_at` — timestamp where the type system makes it sensible

New seeds use deterministic values (no `random()`), so reruns are stable.

## dev/db.mjs changes

Add the 10 entries to the `BIG` table:

- mysql / mariadb / clickhouse: `run('docker', ['compose', 'exec', '-T', …], readFileSync(<big.sql>))` — postgres pattern.
- The rest: `nodeSeed(engine, 'big.mjs')` — dynamo pattern.

Update the header comment (line 5) which currently names only
"postgres, redis, dynamo".

## Docs

`docs/DEVELOPMENT.md` big-seed line drops the engine allowlist — every engine
supports big seeding once this lands.

## Error handling

Existing pattern is kept: `run()` exits the process on nonzero status; node
scripts throw and crash with a nonzero exit. Every big seed drops and
recreates only its own object and never touches the normal seed data, so
seeds stay idempotent and additive.

## Verification

Per engine: `npm run db:<engine>`, then `npm run db:seed:big -- <engine>`,
then a count query against the created object (expect the row counts above).
Note mssql runs under amd64 emulation on Apple Silicon — slow start is
expected.

## Out of scope

- No changes to normal seeds or to the `up`/`down` flows.
- No new npm scripts — `npm run db:seed:big -- <engine>` already routes.
- No CI wiring for big seeds.
