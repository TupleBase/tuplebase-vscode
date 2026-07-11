# Rowboat Roadmap

Rowboat is a VS Code multi-database workbench — Postgres · MySQL · Redis · DynamoDB — driven by a secret-free `.rowboat.json`. This file is the map; the shipped log is condensed to one line per feature, and only the genuinely-remaining work is kept in detail.

**Legend:** ✅ shipped · 🚧 partial · 🔒 owner-gated
**Guides:** [Architecture](ARCHITECTURE.md) · [Database support](DATABASES.md) · [MCP server](MCP.md) · [Testing](TESTING.md)

---

## What Rowboat does today

Connect to Postgres, MySQL, Redis and DynamoDB from one explorer. Connections live in **groups** in `.rowboat.json` — `version: 1`, secret-free, `${env:VAR}` interpolation, JSON-schema IntelliSense. Browse each connection's schema, author queries with per-engine autocomplete + history, and run them (`cmd+enter` for the statement under the cursor, `cmd+shift+enter` for the file) into a VS Code-themed grid — statements become result tabs, a row opens a themed JSON detail view, unbounded reads page with **Load more**. Create/edit/remove connections and groups from the UI (2-stage form, toolbar/context menus, drag-and-drop, jsonc writeback). Passwords stay in the OS keychain (edit, reset per-connection, or prompt every connect); read-only connections block writes; runaway queries time out. Reach databases behind a bastion with a per-connection `ssh` tunnel, and expose the same connections to AI agents through a read-only-by-default MCP server.

---

## ✅ Shipped

**Workbench**
- ✅ Postgres · MySQL · Redis · DynamoDB adapters (SQL / PartiQL / redis commands)
- ✅ Groups model + connection/group CRUD from the UI (form, menus, toolbar button, drag-and-drop)
- ✅ Per-engine autocomplete + query history; run statement / run whole file → result tabs
- ✅ VS Code-themed grid; themed, collapsible JSON row detail + copy
- ✅ Read-only write guardrail; query timeout; **Load more** pagination (`LIMIT pageSize+1` pushdown + continuation token)
- ✅ Keychain secrets — edit password, per-connection **Reset Credentials**, or **prompt every connect** (no store)
- ✅ SSH bastion tunnels (per-connection `ssh` block, ssh2)

**Extensible adapters**
- ✅ Each DB is a self-contained plugin in `src/adapters/<db>/`, registered in one line ([`registry.ts`](../src/adapters/registry.ts))
- ✅ Eager presentations + **lazy per-adapter chunks** — core bundle ~848KB, flat activation to hundreds of adapters
- ✅ JSON schema generated from descriptors (`npm run gen:schema`); per-adapter bundled SVG icons
- ✅ CockroachDB works through the `postgres` adapter (verified)

**Agents & ops**
- ✅ MCP server — `list_connections` / `inspect_schema` / `run_query`, read-only for agents by default ([`MCP.md`](MCP.md))
- ✅ Large-dataset seeds (`db:seed:big`); CI = unit + live-container integration + VS Code smoke

---

## Remaining

### 🚧 1. Implement the candidate adapters

Build out the databases under **Candidates** in [`DATABASES.md`](DATABASES.md), each via the add-adapter checklist (folder + one registry line + `npm run gen:schema` + unit/IT tests + compose service & seed). The lazy-chunk registry and the paginating `execute` contract are in place, so each new adapter stays cheap and paginates from day one.

- **Done:** MySQL (adapter), CockroachDB (via `postgres`).
- **Next, by ask + effort:** SQLite (file-based, dev/demo — small); verify **MariaDB via the `mysql` adapter** (quick, like CockroachDB); then MongoDB (first non-SQL surface — MQL). Later: MS SQL Server, ClickHouse, Cassandra/Scylla, Elasticsearch/OpenSearch, Snowflake/BigQuery, Neo4j, Kafka.
- **Support pieces as the count climbs:** a `new-adapter` scaffold, a shared conformance/contract test every adapter must pass, and `category`/`tags` on the presentation for a searchable, grouped picker.

### 🔒 2. Official brand icons

Swap the clean **placeholder** SVGs (and the emoji form-card fallback) for each database's **official** logo across the tree, connected-variant and form card. The per-adapter drop-in mechanism exists (`src/adapters/<id>/<id>.svg`) — this is blocked only on sourcing the assets under each vendor's trademark/brand guidelines (no recolour/distortion; keep the codicon fallback where there's no redistributable mark).

### 3. Rename the product to *Tuple* — decision TBD

Full rename of the product from **Rowboat** to **Tuple** (name not final — decision pending). If it lands, do it **before** publishing so the marketplace identity ships correct from day one: display name, extension `name`/`publisher`/id, command namespace (`rowboat.*` → `tuple.*`), the `.rowboat.json` config filename + activation event, `BRAND` string, icons/media, docs and repo. Provide a migration path for existing `.rowboat.json` files (accept both names for a release, or a one-time rename prompt).

### 🔒 4. Publishing — the final goal *(needs the owner's Azure DevOps / Entra account)*

- Publisher setup + first pre-release (Entra ID auth; icon/keywords/manifest; odd/even minor = pre-release/release)
- Open VSX too (Cursor / Windsurf / VSCodium)
- CI publish-on-tag + THIRD-PARTY-NOTICES generation
- Monetization seam only: `license.ts` with `isProEnabled() => true`
- CHANGELOG.md + README screenshots/gif (page quality drives installs)
- Public website / landing page — install links, docs, screenshots, gifs

---

## Not scheduled

**Later / pro** — skipped by design: grid cell editing with write-back · EXPLAIN visualizer · telemetry.

**Open polish:** SQL completion for table-qualified columns without an alias (`FROM crew … crew.id`).
