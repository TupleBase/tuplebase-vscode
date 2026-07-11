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
- [ ] SQL completion: resolve columns for table-qualified references without an alias (for example, `FROM crew ... crew.id`)
- [x] Redis command completion (static table) + key completion via SCAN
- [x] PartiQL keywords + table/attribute completion from the Dynamo cache
- [x] Query history: JSONL per workspace, history tree in the sidebar, click to rerun — redact sensitive commands (redis `AUTH`), size cap + pruning
- [ ] Marketplace publisher setup + first 0.1.x pre-release — decided 2026-07-07: publishing happens LAST, after Plans 04/05 (needs owner's Azure DevOps/Entra account)

## Plan 04: Safety + results-grid table stakes

- [x] Prod guardrails: `"readonly": true` flag on an environment blocks adapter-specific writes before connecting or executing.
- [x] Default query timeout: `rowboat.queryTimeoutMs` cancels forgotten runaway queries after 30 seconds by default.
- [x] Results table UX: honor VS Code dark/light themes and polish the grid's visual hierarchy
- [x] Run whole file / selection: multiple statements → multiple result sets (tabs in the results panel)
- [x] Detail view for non-tabular values: row click → JSON side view (redis blobs, dynamo nested items)

## Plan 05: Groups + connection CRUD from the UI

Redesigned 2026-07-11: **environments are removed** — connections are the unit, groups/folders only organise, and there is no active environment (a run resolves via the file's bound connection). Design: `~/memory/2026-07-11-rowboat-plan05-phase1-groups-design.md`. Built in phases, each its own spec → plan → build:

- [x] **Phase 1 — Foundation (groups model)**: `.rowboat.json` → `version: 1` + `groups`; `readonly` per-connection (+ optional group default); `ConnectionManager` and the secret vault keyed by connection name; explorer lists all connections flat; environment status bar removed. Pushed 1bd749e.
- [x] **Phase 2 — Explorer accordion**: groups as collapsible folder nodes (group › connection › schema); jsonc writeback module. Pushed 78cf19a.
- [ ] **Phase 3 — Group CRUD**: [x] New Group toolbar command; still to do — rename/delete/duplicate (context menu) + drag a connection between groups (TreeDragAndDropController), all synced to `.rowboat.json`
- [ ] **Phase 4 — Connection CRUD webview**: per-group "+" opens a 2-stage form (grid of DB-type cards → dedicated per-adapter form) → writeback; add/edit/remove; reuse the cards for the "+" new-query panel
- [ ] **Phase 5 — Settings**: `contributes.configuration` results page size + max rows (`rowboat.queryTimeoutMs` already exists)
- [ ] Multi-root workspaces: config still resolves from the first folder — document the limitation (folder picker only if someone asks)

Legacy `environments` configs are not supported (new shape only); `version` is the future migration seam.

## Plan 06: Publishing

- [ ] Publisher setup + first pre-release pulled forward to Plan 03 (Entra ID auth — PATs die Dec 2026); here: icon/keywords/manifest polish, odd/even minor = pre-release/release
- [ ] Open VSX too (Cursor/Windsurf/VSCodium)
- [ ] CI publish job on tag; THIRD-PARTY-NOTICES generation
- [ ] Monetization seam only: `license.ts` with `isProEnabled() => true` — nothing else
- [ ] CHANGELOG.md (marketplace renders it) + README screenshots/gif — page quality drives installs

## Deferred (tracked, not scheduled)

Statement-splitter for PartiQL edge cases, SSH tunnels (decided: deferred until asked for).

Later / pro territory (deliberately skipped for now): grid cell editing with write-back, EXPLAIN visualizer, telemetry.
