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

Build out the databases under **Candidates** in [`DATABASES.md`](DATABASES.md), each via the add-adapter checklist (folder + one registry line + `npm run gen:schema` + unit/IT tests). The lazy-chunk registry and the paginating `execute` contract are in place, so each new adapter stays cheap and paginates from day one. **Done:** MySQL (adapter), CockroachDB (via `postgres`).

Split by whether it can run **locally** (Docker container or a file → the same live-container IT as Postgres/MySQL: add a compose service + seed + `db:<x>` script) vs. **cloud-only** (needs an account, so live IT can't run in CI).

#### 1a. 🟢 Local-testable — do these first
Each has a local image/file, so it gets a real live-container integration test like today.

| DB | Local image / driver | Notes |
|---|---|---|
| SQLite | file, no server (`node:sqlite` / better-sqlite3) | easiest — start here; great for dev/demo |
| MariaDB | `mariadb` | **verify it works through the `mysql` adapter first** — likely no new adapter |
| MongoDB | `mongo` | first non-SQL surface (MQL) |
| MS SQL Server | `mcr.microsoft.com/mssql/server` | Linux; `ACCEPT_EULA=Y` + SA password (heavy image) |
| ClickHouse | `clickhouse/clickhouse-server` | analytics; HTTP/native |
| Neo4j | `neo4j` | Cypher, graph |
| Cassandra / ScyllaDB | `cassandra` / `scylladb/scylla` | CQL; slow to boot |
| Elasticsearch / OpenSearch | `elasticsearch` / `opensearchproject/opensearch` | heavy; single-node + memory limits |
| Kafka | `apache/kafka` | KRaft single-node; topic browse / consume, not a DB |

#### 1b. 🔒 Cloud-only — no solid local server
Build the adapter + unit tests against a **mocked** client; gate live IT behind real credentials, off by default (skipped in CI).

| DB | Why not local |
|---|---|
| Snowflake | account-only, no local server |
| BigQuery | GCP project/credentials (a partial emulator exists) |

**Support pieces as the count climbs:** a `new-adapter` scaffold, a shared conformance/contract test every adapter must pass, and `category`/`tags` on the presentation for a searchable, grouped picker.

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

## After launch

### 5. Schema explorer / ER diagram *(easy)*

Pick tables and plot them on a canvas with the relationships drawn between them — an ER-style view. Mostly for the SQL engines (Postgres/MySQL/MS SQL): read foreign keys from the catalog (`information_schema.key_column_usage` + `table_constraints`, or `pg_constraint`) so each edge is a real FK reference; nodes show the table's columns with PK/FK badges. A webview canvas reusing the existing results/webview pattern; start from a selection of tables in the explorer.

### 6. Table filter in the explorer

For a connection with many tables, a filter/search box to narrow the schema tree to matching tables (and optionally columns) instead of scrolling the whole list. Client-side filter over the loaded tree, backed by the adapter's existing `searchItems` for very large schemas.

### 7. Per-engine entity refinement *(investigate first)*

Surface more database objects than tables/columns/keys — **views**, materialized views, **stored procedures / functions**, triggers, sequences, indexes, enums, etc. — as their own tree node kinds per connection, with sensible actions (open definition, run). Which objects are worth showing (and how to browse/execute them) differs by engine, so this needs a short investigation per adapter before building.

---

## Not scheduled

**Later / pro** — skipped by design: grid cell editing with write-back · EXPLAIN visualizer · telemetry.

**Open polish:** SQL completion for table-qualified columns without an alias (`FROM crew … crew.id`).
