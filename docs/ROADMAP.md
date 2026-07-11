# Rowboat Roadmap

Rowboat is a VS Code multi-database workbench — Postgres · Redis · DynamoDB — driven by a secret-free `.rowboat.json`. Detailed per-plan specs live in the personal vault; this file is the map.

**Status:** Plans 01–05 shipped. Publishing (Plan 06) and agent access (Plan 07) remain.

**Database support** — shipped adapters and candidates are tracked in [`DATABASES.md`](DATABASES.md).

---

## What Rowboat does today

Connect to Postgres, Redis and DynamoDB from one explorer. Connections live in **groups** (folders) in `.rowboat.json` — `version: 1`, secret-free, `${env:VAR}` interpolation, JSON-schema IntelliSense. Browse each connection's schema/keys, author queries with per-engine autocomplete and history, and run them (`cmd+enter` for the statement under the cursor, `cmd+shift+enter` for the whole file) into a VS Code-themed Tabulator grid — multiple statements become result tabs, a row opens a JSON detail view. Create/edit/remove connections and groups entirely from the UI (2-stage webview form, context menus, drag-and-drop); every edit is written back to the config with comments preserved. Passwords are prompted once and kept in the OS keychain. Read-only connections block writes; runaway queries time out.

---

## Shipped

### ✅ Plan 01 — Walking skeleton · merged 2026-07-05
Postgres end-to-end: config → schema explorer → run SQL → Tabulator grid (cancel + paging). Keychain secrets, dockerized dev Postgres, unit + live-container integration + VS Code smoke tests, CI.

### ✅ Plan 02 — Redis + DynamoDB adapters
Redis (`.redis` command files, key-namespace tree, optional `auth`) and DynamoDB (PartiQL via AWS SDK v3, tables/keys/GSI tree, AWS credential chain, dynamodb-local endpoint). Postgres TLS (`sslmode` + CA cert). Statement-splitter hardening; compose + seed scripts.

### ✅ Plan 03 — Workbench: autocomplete + history
New-query scratch buffers; schema-cache SQL completion; Redis command + SCAN key completion; PartiQL completion; per-workspace query history (JSONL, click-to-rerun, redaction, pruning).
- ◻︎ **Open:** SQL completion for table-qualified columns without an alias (`FROM crew … crew.id`).

### ✅ Plan 04 — Safety + results-grid table stakes
Read-only write guardrail; default query timeout (`rowboat.queryTimeoutMs`); VS Code-themed grid; run-whole-file → result tabs; row → JSON detail view for non-tabular values.

### ✅ Plan 05 — Groups + connection CRUD from the UI
**Environments removed** — connections are the unit, groups are folders, and a run targets the connection bound to its file (no active environment).
- **Model** → `version: 1` + `groups`; per-connection `readonly` (+ optional group default); connection manager and secret vault keyed by connection name.
- **Explorer** → group-first (group › connection › schema); per-type icons from a shared adapter catalog.
- **CRUD from the UI** → New Group; group rename/delete; 2-stage new-connection webview form (DB-type cards → per-adapter fields); connection edit (pre-filled) / remove; drag a connection between groups — all via jsonc writeback, comments preserved.
- New Query is per-connection; settings `rowboat.resultsPageSize` + `rowboat.maxRows`.

---

## Remaining

### Plan 06 — Publishing · owner-gated, deliberately last
Needs the owner's Azure DevOps / Entra account — not startable here.
- Publisher setup + first pre-release (Entra ID auth; icon/keywords/manifest; odd/even minor = pre-release/release)
- Open VSX too (Cursor / Windsurf / VSCodium)
- CI publish-on-tag + THIRD-PARTY-NOTICES generation
- Monetization seam only: `license.ts` with `isProEnabled() => true`
- CHANGELOG.md + README screenshots/gif (page quality drives installs)
- Public website / landing page — install links, docs, screenshots, gifs

### Plan 07 — MCP server: let agents query sources
Expose the configured connections through a Model Context Protocol server so any AI agent can discover connections, inspect schema, and run queries against Postgres / Redis / DynamoDB (and future adapters). Reuse the existing adapters, config and read-only guardrail — default read-only for agents; secrets stay in the OS keychain. Design TBD.

### Deferred · tracked, not scheduled
Statement-splitter PartiQL edge cases · SSH tunnels.

### Later / pro · skipped by design
Grid cell editing with write-back · EXPLAIN visualizer · telemetry.
