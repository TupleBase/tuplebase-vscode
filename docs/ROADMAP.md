# Rowboat Roadmap

Design spec lives outside the repo (personal vault). Detailed per-task plans are written when a plan starts; this file is the quick overview.

## Done — Plan 01: Walking skeleton (merged 2026-07-05)

Postgres end-to-end: `.rowboat.json` config (JSONC, secret-free, `${env:VAR}` interpolation, JSON-schema IntelliSense) → activity-bar schema explorer → environment picker in status bar → run SQL from editor (cmd+enter) → Tabulator results grid with cancel and paging. Passwords prompted once, stored in OS keychain (SecretStorage). Dockerized dev postgres (`npm run db:postgres`), 31 tests (unit + live-container integration), VS Code smoke test, CI on GitHub Actions.

## Next — Plan 02: Redis + DynamoDB adapters

- [x] Statement splitter upgrade: double-quoted identifiers + dollar-quoted strings (bites first when dogfooding Postgres)
- [x] Compose services + seed script for redis and dynamodb-local (`db:redis`, `db:dynamo`, `db:seed`)
- [x] Redis adapter: commands from `.redis` files (one per line, `#` comments), key-namespace tree, optional `"auth": true` → password prompt
- [x] `.redis` language contribution + per-language run extraction (SQL statement vs redis line)
- [x] DynamoDB adapter: PartiQL via AWS SDK v3, tables/keys/GSI tree, AWS credential chain (profile/SSO/env — never stored), `endpoint` for dynamodb-local
- [x] Postgres TLS options: `sslmode`, CA cert path in connection config (hosted DBs require it)
- [x] Cleanup batch: deferred minors from Plan 01 reviews (dot-safe tree ids, tightened auth-error regex, CI dedup, testConnection(cfg) contract, webview pending queue, pg cancellation IT test)

## Plan 03: Workbench — autocomplete + query history

Goal: type queries with IntelliSense and run them in place. Running from any `.sql` file already works (Plan 01); this plan adds the completion layer and the frictionless entry points.

- [x] "New Query" command: opens an untitled `sql`/`redis` scratch buffer, runnable immediately (toolbar button on the explorer + command palette)
- [x] SQL completion from the schema-tree cache (tables after FROM/JOIN, columns after `alias.`) — heuristics first, dt-sql-parser later if needed
- [x] Redis command completion (static table) + key completion via SCAN
- [x] PartiQL keywords + table/attribute completion from the Dynamo cache
- [x] Query history: JSONL per workspace, history tree in the sidebar, click to rerun — redact sensitive commands (redis `AUTH`), size cap + pruning
- [ ] Marketplace publisher setup + first 0.1.x pre-release — decided 2026-07-07: publishing happens LAST, after Plans 04/05 (needs owner's Azure DevOps/Entra account)

## Plan 04: Safety + results-grid table stakes

- [ ] Prod guardrails: `"readonly": true` flag on an environment → block (or confirm) writes; nothing stops cmd+enter `DELETE` on prod today. Write detection is per-adapter: SQL DML/DDL, redis mutating commands (`SET`/`DEL`/`FLUSHALL`…), PartiQL `INSERT`/`UPDATE`/`DELETE` — one SQL regex won't cover it
- [ ] Default query timeout (cancel exists; timeout catches the forgotten runaway)
- [ ] Grid export/copy: CSV/JSON export, copy cell/row/column
- [ ] Run whole file / selection: multiple statements → multiple result sets (tabs in the results panel)
- [ ] Detail view for non-tabular values: row click → JSON side view (redis blobs, dynamo nested items)

## Plan 05: Environment/connection CRUD from the UI

- [ ] Explorer goes accordion: every environment becomes a top-level collapsible node (today the tree roots at the active env's connections only)
- [ ] Environment CRUD (add/rename/delete/duplicate) entirely in the left panel: mini toolbar on the view title + context menu on environment nodes
- [ ] Connection CRUD (add/edit/remove) opens a webview form in an editor tab on the right — not inline in the tree
- [ ] Status-bar picker unchanged: still selects the *active* environment for query runs, even with all envs visible in the tree
- [ ] All edits write back to `.rowboat.json` via jsonc-parser `modify`/`applyEdits` so comments and formatting survive
- [ ] `"version": 1` field in `.rowboat.json` schema (migration seam — must land before the config shape has real users)
- [ ] `contributes.configuration` settings: results page size, max rows, default query timeout
- [ ] Multi-root workspaces: config still resolves from the first folder — document the limitation (folder picker only if someone asks)

Scope agreed 2026-07-06; design not finalized — brainstorm/design session required before implementing.

## Plan 06: Publishing

- [ ] Publisher setup + first pre-release pulled forward to Plan 03 (Entra ID auth — PATs die Dec 2026); here: icon/keywords/manifest polish, odd/even minor = pre-release/release
- [ ] Open VSX too (Cursor/Windsurf/VSCodium)
- [ ] CI publish job on tag; THIRD-PARTY-NOTICES generation
- [ ] Monetization seam only: `license.ts` with `isProEnabled() => true` — nothing else
- [ ] CHANGELOG.md (marketplace renders it) + README screenshots/gif — page quality drives installs

## Deferred (tracked, not scheduled)

Statement-splitter for PartiQL edge cases, SSH tunnels (decided: deferred until asked for).

Later / pro territory (deliberately skipped for now): grid cell editing with write-back, EXPLAIN visualizer, telemetry.
