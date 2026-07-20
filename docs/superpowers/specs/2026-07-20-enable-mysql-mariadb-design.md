# Enable MySQL + MariaDB — design

**Date:** 2026-07-20
**Status:** Approved
**Scope:** Land on `main` only. Release/version bump is a separate, later decision.

## Goal

Flip the MySQL adapter from "Coming soon" to enabled, and give MariaDB its own
New Connection picker entry for user familiarity — backed by the same `mysql2`
driver, since MariaDB speaks the MySQL wire protocol (already verified end to
end by `src/adapters/mysql/mariadb.it.test.ts`).

## Decisions

- **MariaDB gets its own picker entry** (`adapter: "mariadb"` in config), not a
  docs-only note. This intentionally differs from the CockroachDB-via-postgres
  precedent: familiarity in the picker is the point. The entry is an alias —
  a thin presentation + chunk that reuses the mysql factory. No new driver
  dependency.
- **One driver for both.** `mysql2` drives MySQL and MariaDB. No `mariadb` npm
  package.
- **Rollout stays per-version.** Both ids join `ENABLED_ADAPTER_IDS`; the
  existing gate handles picker, completion, MCP server, and config loading.

## Changes

### 1. Rollout gate

`src/adapters/registry.ts`: `ENABLED_ADAPTER_IDS = ['postgres', 'mysql', 'mariadb']`.

### 2. New alias folder `src/adapters/mariadb/`

- `presentation.ts` — `id: 'mariadb'`, label `MariaDB`, 🦭, `mariadb.svg`,
  same fields, default port 3306, and write rule as mysql (share pieces with
  the mysql presentation where that stays clean).
- `index.ts` — re-exports the mysql factory and the shared SQL completion
  (mirrors `mysql/index.ts`, which re-exports the postgres completion).
- `mariadb.svg` + `mariadb-connected.svg` — new icons, style-matched to the
  existing adapter SVGs.
- esbuild discovers the folder automatically → `dist/adapters/mariadb/` chunk.
  No build config change.

### 3. Schema

`npm run gen:schema` regenerates `schemas/tuplebase.schema.json`;
`"mariadb"` becomes a valid `adapter` value. Generated output is never edited
by hand.

### 4. Docs and config, same commit

- `docs/DATABASES.md`: MySQL row → **Preview**. MariaDB row → **Preview**,
  `adapter` column → `mariadb`, note that it is its own picker entry backed by
  the mysql driver (wire-compatible).
- `README.md` (§ line 61): move MySQL and MariaDB from the in-development
  sentence to supported.
- `CHANGELOG.md`: entry covering both.
- `dev/playground/.tuplebase.json`: `local-mariadb` → `adapter: "mariadb"`.

### 5. Tests

- `src/adapters/registry.test.ts`: enabled-view assertions →
  `['postgres', 'mysql', 'mariadb']`; all-presentations list gains `mariadb`.
- `src/core/config.test.ts`: the disabled-adapter example currently uses
  `mysql` — switch it to `sqlite` so it still tests the skip path.
- `src/adapters/mysql/mariadb.it.test.ts`: config `adapter` → `'mariadb'` so
  the integration test routes through the alias id.
- New unit coverage for the mariadb presentation shape, mirroring existing
  presentation tests.

### 6. Verification

- Fast bar: `npm run check` and `npm test`.
- Full proof: `TUPLEBASE_IT=1` integration tests against
  `npm run db:start -- mysql mariadb` + seeds.

## Out of scope

- Release chores (version bump, packaging).
- CockroachDB getting the same alias treatment via postgres — worth
  considering separately now the pattern exists.
