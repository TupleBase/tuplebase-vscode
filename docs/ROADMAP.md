# Rowboat Roadmap

Rowboat is a VS Code multi-database workbench — Postgres · Redis · DynamoDB — driven by a secret-free `.rowboat.json`. Detailed per-plan specs live in the personal vault; this file is the map.

**Status:** Core shipped — the Postgres/Redis/DynamoDB workbench, adapter modularization, per-adapter icons, the PartiQL splitter fix, SSH tunnels and the MCP server. Remaining work is numbered below; Publishing is the final, owner-gated goal.

**Database support** — shipped adapters and candidates are tracked in [`DATABASES.md`](DATABASES.md).

---

## What Rowboat does today

Connect to Postgres, Redis and DynamoDB from one explorer. Connections live in **groups** (folders) in `.rowboat.json` — `version: 1`, secret-free, `${env:VAR}` interpolation, JSON-schema IntelliSense. Browse each connection's schema/keys, author queries with per-engine autocomplete and history, and run them (`cmd+enter` for the statement under the cursor, `cmd+shift+enter` for the whole file) into a VS Code-themed Tabulator grid — multiple statements become result tabs, a row opens a JSON detail view. Create/edit/remove connections and groups entirely from the UI (2-stage webview form, context menus, drag-and-drop); every edit is written back to the config with comments preserved. Passwords are prompted once and kept in the OS keychain (reset a bad one per-connection without clearing the rest). Read-only connections block writes; runaway queries time out. Reach databases behind a bastion with a per-connection `ssh` tunnel. The same connections are exposed to AI agents through a read-only-by-default MCP server.

---

## Shipped

### ✅ Walking skeleton · merged 2026-07-05
Postgres end-to-end: config → schema explorer → run SQL → Tabulator grid (cancel + paging). Keychain secrets, dockerized dev Postgres, unit + live-container integration + VS Code smoke tests, CI.

### ✅ Redis + DynamoDB adapters
Redis (`.redis` command files, key-namespace tree, optional `auth`) and DynamoDB (PartiQL via AWS SDK v3, tables/keys/GSI tree, AWS credential chain, dynamodb-local endpoint). Postgres TLS (`sslmode` + CA cert). Statement-splitter hardening; compose + seed scripts.

### ✅ Workbench: autocomplete + history
New-query scratch buffers; schema-cache SQL completion; Redis command + SCAN key completion; PartiQL completion; per-workspace query history (JSONL, click-to-rerun, redaction, pruning).
- ◻︎ **Open:** SQL completion for table-qualified columns without an alias (`FROM crew … crew.id`).

### ✅ Safety + results-grid table stakes
Read-only write guardrail; default query timeout (`rowboat.queryTimeoutMs`); VS Code-themed grid; run-whole-file → result tabs; row → JSON detail view for non-tabular values.

### ✅ Groups + connection CRUD from the UI
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

### ✅ MCP server
A standalone Model Context Protocol server (`dist/mcp/server.js`) exposes `list_connections`, `inspect_schema` and `run_query` over the same adapters, config and read-only guardrail — read-only for agents by default. Secrets arrive as env vars; **Rowboat: Show MCP Server Config** emits a client config with them pulled from the keychain.

### ✅ Large paging datasets
Opt-in high-volume seeds for exercising results paging and grid volume, kept separate from the small default fixtures so the everyday dev DBs stay fast. `npm run db:seed:big` loads all three engines (or per-engine `db:seed:big:{postgres,redis,dynamo}`): Postgres `pagination_demo` (10,000 rows via `dev/seed/postgres/big.sql`), Redis `pagedemo:*` (5,000 keys), DynamoDB (2,000 items via `dev/seed/dynamo/big.mjs`).

---

## Remaining

### 1. Scale the adapter registry to 100s (in-tree, no plugins)

The registry pattern already lands "add a DB = drop a folder + one line". The plugin model was only ever for third-party *distribution*, never performance — in-tree scales to 100s fine with lazy loading + a split bundle. **Drop the plugin idea.**

Why in-tree holds: activation cost stays flat regardless of adapter count. The catalog is a manifest of presentations (500 adapters × ~500B ≈ 250KB, parsed once), each adapter's code is its own chunk that only loads when a connection to it is opened, and drivers are bundled inside their adapter chunk — so the core bundle stays O(1).

- **Rung 1 — descriptor → lazy loaders.** `presentation` stays eager data; `factory`/`completion` become `loadFactory: () => import('./adapter')` / `loadCompletion: () => import('./completion')`. Registry maps id → module; connect does `const f = await mod.loadFactory()`. Presentations render the form/tree/picker without touching any adapter code.
- **Rung 2 — split the bundle (keep CJS).** Not `splitting:true` (that forces ESM; the VS Code host entry is CJS). Instead a second esbuild pass, one entry per `src/adapters/*/index.ts` → `dist/adapters/<id>/index.js`, each pulling its driver in. The core `extension.js` no longer carries any driver.
- **Manifest** — a build step scans `src/adapters/*/presentation.ts` into a single `manifest.json`; activation reads that one file for the catalog, zero adapter code loaded.
- **The one real tax (name it):** all drivers sit in one `package.json` / `node_modules` — install size, `npm install`/CI time, driver version-conflict surface, supply-chain audit surface all grow with count. It's an install/maintenance cost, not a runtime one (drivers ship but never load at startup). Mitigate: `optionalDependencies` for fat/rare drivers, pnpm/hoist discipline, periodic `npm audit`.
- **Support pieces at 100s:** `npm run new-adapter <id>` scaffold (folder + presentation + factory stub + conformance test); a shared conformance/contract test every adapter must pass (generalise the current `adapter.it.test.ts`); `category`/`tags` on `AdapterPresentation` for a searchable, grouped picker (100s of flat cards is unusable).

Ship Rung 1 first (lazy loaders + manifest against the current 3 adapters as the pattern), then Rung 2 (multi-entry CJS split).

### 2. Better pagination — server-side windows, "load more", and guardrails

Today "paging" is a single fetched window sliced client-side, not true pagination — and each engine leaks differently (exercise it with `npm run db:seed:big`):
- **Postgres over-fetches** — the driver pulls the *entire* result set into memory, then slices to `pageSize` and warns `showing first N of M rows`. `SELECT *` on the 10k-row `pagination_demo` transfers all 10k just to show 500. No `LIMIT` pushdown.
- **DynamoDB stops at page 1** — `execute` follows `NextToken` only until the first `pageSize` items, then discards the token. No way to continue.
- **Redis SCAN is capped** — key discovery stops at `KEY_SCAN_CAP` and the tail is silently dropped.
- **The grid pages client-side** over that one window only — to see rows 501+ you hand-write `LIMIT/OFFSET` (SQL), a `SCAN` cursor (Redis) or a `NextToken` (Dynamo).

**Spike the approach first — this is a design question, not just an implementation.** Decide before building:
- **Offset vs keyset/cursor.** `LIMIT/OFFSET` is simple but degrades on deep pages (the DB still scans+discards the skipped rows) and drifts under concurrent writes; keyset ("seek") pagination is stable and fast but needs a deterministic sort key. Pick per engine and per query shape.
- **Grid virtualization vs discrete pages.** Tabulator already has virtual-DOM rendering / progressive (infinite) scroll — evaluate render-virtualization for a large window + fetch-more-on-scroll against explicit page buttons. Virtualization keeps 10k rows from freezing the webview regardless of the fetch strategy.
- **What comparable tools do** — survey and borrow: DataGrip / pgAdmin (configurable page size + fetch-more on scroll), TablePlus / Beekeeper Studio (server-side paged fetch), the DynamoDB console (token-based next page, no jump), `psql` `FETCH`/cursors. Note which expose true random-access paging vs forward-only cursors.
- **Defaults & ceilings** — revisit `resultsPageSize` (500) / `maxRows` (5000): the fetch-window default, the hard ceiling, and whether "load more" raises the ceiling or just advances the window.

Then fix in two halves — a real continuation contract, plus guardrails so an unbounded query can't hurt.

- **Continuation in the adapter contract.** Extend `execute` to return an opaque `nextCursor` beside `rows`, and accept it back to fetch the next window. Per engine: keyset / `LIMIT pageSize+1` for Postgres (the +1 row proves a next page exists without a `count(*)`), `NextToken` passthrough for DynamoDB, `SCAN` cursor for Redis.
- **"Load more" / page controls in the grid.** A next-page affordance plus a running "showing 1–500, more available" indicator that calls back with the cursor — instead of forcing a hand-edited `LIMIT/OFFSET`. Prev/jump once cursors are stable.
- **Push the limit down.** For a `SELECT` with no explicit `LIMIT`, inject `LIMIT pageSize+1` server-side rather than fetch-everything-then-slice, so the DB does bounded work; the sentinel +1 sets "more available".
- **Guardrails against runaway scans.** Keep the `maxRows` hard ceiling; auto-bound un-limited SELECTs (opt-out setting); warn/confirm before a full scan on a large table or an unbounded Redis `KEYS`/`SCAN`; surface *when* a cap truncated results instead of silently dropping the tail. Read-only guard and query timeout already exist — this is the missing **volume** guardrail.

- **Land before item 3** so the candidate adapters are built against the paginating contract from day one — make `nextCursor` part of the shared conformance test (item 1).

### 3. Implement the candidate adapters

Build out every database listed under **Candidates** in [`DATABASES.md`](DATABASES.md), each following the add-adapter checklist (folder + one registry line + `npm run gen:schema` + unit/live-container tests + compose service & seed + graduate the row to Shipped). Candidates today: MySQL / MariaDB, SQLite, Microsoft SQL Server, MongoDB, CockroachDB, ClickHouse, Cassandra / ScyllaDB, Elasticsearch / OpenSearch, Snowflake / BigQuery, Neo4j, Apache Kafka.

- **Prioritise by ask + effort:** SQLite and MySQL/MariaDB first (frequent, easy, great for dev/demo); CockroachDB early — **verify it works through the existing `postgres` wire adapter** before writing a new one; warehouses (Snowflake/BigQuery) and non-SQL surfaces (MongoDB MQL, Neo4j Cypher, Cassandra CQL, Kafka topic browse) later.
- **Depends on item 1** landing so activation stays flat as the count climbs, and on **item 2**'s continuation contract so each new adapter paginates from day one.

### 4. Explorer toolbar: New Connection button

Add a **New Connection** action to the explorer view's title toolbar. Today a connection is created from a group's context menu — the toolbar button makes it reachable without first picking a group. The button opens the same 2-stage new-connection webview form as today (DB-type cards → per-adapter fields); on save the connection lands at the **top level** by default, and the user drags it into a group afterwards (connection drag-and-drop already exists — shipped).

- **Dependency:** the model is `version: 1` + `groups`, so connections currently must live inside a group (shipped). "Top level" needs either group-less connections or an implicit default bucket — decide before building. Drag-and-drop then moves the top-level connection into a real group.

### 5. Consolidate DB icons to official brand assets

Icons are a mix today — an `emoji` per adapter (connection-form card) plus clean but **unofficial** placeholder SVGs (per-adapter icons ship as "original brand-coloured placeholders"). Replace both with each database's **official** logo across all surfaces: tree icon, connected-variant (green-dot) icon, and the connection-form type card — dropping the emoji fallback where a real mark exists. One consistent official mark per adapter, bundled in its folder (`dist/adapters/<id>/<id>.svg`).

- **Watch trademark/usage terms** — many DB logos have brand guidelines (no recolour/distortion, clearspace). Keep each vendor's SVG unmodified; keep the codicon fallback for adapters with no redistributable mark.

### 6. Edit connection: allow the password to be edited

The edit-connection form is pre-filled from config (shipped) but can't change the password — secrets live in the keychain, never in `.rowboat.json`, so today a password change needs the separate **Reset Credentials** command. Surface it in the edit form: a password field that writes to the keychain only (not the config), with a "leave blank to keep the existing secret" affordance so an unchanged edit doesn't wipe it.

- Reuse the existing per-connection Reset Credentials path (keychain write keyed by connection name); the form field just triggers the same write on save when non-empty.

### 7. Choose password handling at connection creation

Today a password is always persisted to the OS keychain on first prompt. Let the user pick at create time:
- **Store the secret (not committable)** — written to the **OS keychain** via VS Code SecretStorage (macOS Keychain / Windows Credential Manager / libsecret on Linux), keyed by connection name. **Never** in `.rowboat.json` — the config stays secret-free and safe to commit. This is today's behaviour, made explicit.
- **Don't store — prompt every time** — nothing persisted; the manager prompts on each connect (in-memory for the session at most, gone on reload).

- **Model:** add a non-secret flag to the connection in `.rowboat.json` (e.g. `storeSecret: false` / `promptPassword: true`) so the manager knows to skip the keychain and prompt. The flag is config, not a secret — it commits fine. The connection form's create step exposes the choice (checkbox / toggle).

### 8. JSON detail view: themed formatting + colors

The row → JSON detail view (non-tabular values, shipped) renders plain today. Pretty-print it with syntax highlighting — distinct colors for keys / strings / numbers / booleans / null — and collapsible nested objects and arrays, plus a copy button. Pull the palette from the **active editor theme** so it matches VS Code, not a hardcoded scheme.

- **Theme nuance:** the webview gets `--vscode-*` CSS variables (e.g. `--vscode-editor-foreground`, `--vscode-editor-background`), so background/foreground match for free. But exact syntax token colors (`editor.tokenColorCustomizations`) are **not** exposed as CSS vars. Two options: (a) map JSON token types to the available `--vscode-*` semantic vars for a good-enough theme match, or (b) embed a read-only editor / highlighter for true token colors. Start with (a) — cheaper, no editor dependency.

### 9. Document the MCP server

The MCP server ships (`dist/mcp/server.js`, **Rowboat: Show MCP Server Config**) but has no user docs. Write a guide covering:
- **How to run it** — the stdio launch command, where the config comes from (`Show MCP Server Config` emits a client config with secrets pulled from the keychain), and the env-var secret contract.
- **How to verify it's running correctly** — expected startup output, a smoke test of each tool (`list_connections`, `inspect_schema`, `run_query`), and the read-only-by-default behaviour to confirm.
- **Which clients/agents support it in VS Code** — list the MCP clients tested against it (e.g. Copilot agent mode, Claude, Cline, Continue) with the exact config snippet each needs; note which are verified vs. expected-to-work.
- **Troubleshooting** — no connections listed, secret/keychain misses, read-only writes blocked.

### 10. Publishing — the final goal *(owner-gated: needs the owner's Azure DevOps / Entra account)*
   - Publisher setup + first pre-release (Entra ID auth; icon/keywords/manifest; odd/even minor = pre-release/release)
   - Open VSX too (Cursor / Windsurf / VSCodium)
   - CI publish-on-tag + THIRD-PARTY-NOTICES generation
   - Monetization seam only: `license.ts` with `isProEnabled() => true`
   - CHANGELOG.md + README screenshots/gif (page quality drives installs)
   - Public website / landing page — install links, docs, screenshots, gifs

### Bugs / polish

- **Run CodeLens anchors to the previous line's trailing comment, not the SQL.** `splitStatements` starts each statement's range right after the previous `;`, so a trailing inline comment (`SELECT …;  -- note`) is swept into the *next* statement and its `start` (first non-whitespace) lands on that comment line. The `▶ Run` lens for the following query then renders on the comment line above it — most visibly the **last** query's button sits on the prior statement's line while its own SQL lines look button-less (reproduces in `dev/playground/scratch.sql`: the final `SELECT bucket …` lens anchors on the `-- page 2` line above it). `cmd+enter` still runs the correct statement — `statementAt` resolves by range — so it's cosmetic/discoverability, not execution. **Fix:** advance each statement's `start` past leading comment/whitespace to the first SQL token (reuse the `hasSqlCode` scan) so the lens anchors on the real query line; optionally trim the leading absorbed comment out of the statement text. Add a splitter unit test covering inline trailing comments.

### Not scheduled

**Later / pro** — skipped by design: grid cell editing with write-back · EXPLAIN visualizer · telemetry.
