# Rowboat Roadmap

Rowboat is a VS Code multi-database workbench — Postgres · Redis · DynamoDB — driven by a secret-free `.rowboat.json`. Detailed per-plan specs live in the personal vault; this file is the map.

**Status:** Plans 01–05 shipped, plus the adapter-modularization refactor, per-adapter icons, the PartiQL splitter fix, SSH tunnels and the MCP server (Plan 06). Publishing (Plan 07) is the only item left — owner-gated.

**Database support** — shipped adapters and candidates are tracked in [`DATABASES.md`](DATABASES.md).

---

## What Rowboat does today

Connect to Postgres, Redis and DynamoDB from one explorer. Connections live in **groups** (folders) in `.rowboat.json` — `version: 1`, secret-free, `${env:VAR}` interpolation, JSON-schema IntelliSense. Browse each connection's schema/keys, author queries with per-engine autocomplete and history, and run them (`cmd+enter` for the statement under the cursor, `cmd+shift+enter` for the whole file) into a VS Code-themed Tabulator grid — multiple statements become result tabs, a row opens a JSON detail view. Create/edit/remove connections and groups entirely from the UI (2-stage webview form, context menus, drag-and-drop); every edit is written back to the config with comments preserved. Passwords are prompted once and kept in the OS keychain (reset a bad one per-connection without clearing the rest). Read-only connections block writes; runaway queries time out. Reach databases behind a bastion with a per-connection `ssh` tunnel. The same connections are exposed to AI agents through a read-only-by-default MCP server.

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

### ✅ Adapter modularization
Each connection type is a self-contained plugin: **one folder** (`src/adapters/<db>/`) holds its adapter, form fields, presentation (icon/label/blurb), completion and icon SVGs, exposed as a single `AdapterDescriptor`. `src/adapters/registry.ts` is the one place a new database is registered; config validation, the connection form, tree icons, completion and the connection manager all read from it, and `schemas/rowboat.schema.json` is generated from the descriptors (`npm run gen:schema`). Prerequisite for every candidate in [`DATABASES.md`](DATABASES.md).

### ✅ Per-adapter icons
Bundled SVG per adapter (with a green-dot connected variant) replaces the generic codicons; the tree resolves `dist/adapters/<id>/<id>.svg`, falling back to the codicon. Marks are clean, original brand-coloured placeholders — an official SVG can be dropped into the adapter folder to replace them.

### ✅ Statement-splitter PartiQL edge cases
Adapters declare a `statementSyntax` (`sql` / `partiql` / `redis`); the run path, code lenses and completion resolve it from the file's connection. PartiQL mode drops postgres-only dollar-quoting, so quoted attribute paths, `?` parameters and single-quoted values split correctly.

### ✅ SSH tunnels
A connection may carry an `ssh` block (bastion host/port/user, private-key path, passphrase/password prompt flags). At connect the manager opens an ssh2 tunnel and points the adapter at the local end; the passphrase/password is prompted once and kept in the keychain. Rejected for adapters without a host (DynamoDB).

### ✅ Plan 06 — MCP server
A standalone Model Context Protocol server (`dist/mcp/server.js`) exposes `list_connections`, `inspect_schema` and `run_query` over the same adapters, config and read-only guardrail — read-only for agents by default. Secrets arrive as env vars; **Rowboat: Show MCP Server Config** emits a client config with them pulled from the keychain.

---

## Remaining

**Publishing — the final goal** *(Plan 07, owner-gated: needs the owner's Azure DevOps / Entra account).*
   - Publisher setup + first pre-release (Entra ID auth; icon/keywords/manifest; odd/even minor = pre-release/release)
   - Open VSX too (Cursor / Windsurf / VSCodium)
   - CI publish-on-tag + THIRD-PARTY-NOTICES generation
   - Monetization seam only: `license.ts` with `isProEnabled() => true`
   - CHANGELOG.md + README screenshots/gif (page quality drives installs)
   - Public website / landing page — install links, docs, screenshots, gifs

### Not scheduled

**Later / pro** — skipped by design: grid cell editing with write-back · EXPLAIN visualizer · telemetry.
