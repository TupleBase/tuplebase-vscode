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

Build out the databases under **Candidates** in [`DATABASES.md`](DATABASES.md), each via the add-adapter checklist (folder + one registry line + `npm run gen:schema` + unit/IT tests). The lazy-chunk registry and the paginating `execute` contract are in place, so each new adapter stays cheap and paginates from day one. **Done:** all of §1a — MySQL, SQLite, SQL Server, ClickHouse, Cassandra, Neo4j, MongoDB, Elasticsearch, Kafka (adapters) + CockroachDB (via `postgres`) + MariaDB (via `mysql`). Only §1b (cloud-only) remains.

Split by whether it can run **locally** (Docker container or a file → the same live-container IT as Postgres/MySQL: add a compose service + seed + `db:<x>` script) vs. **cloud-only** (needs an account, so live IT can't run in CI).

#### 1a. 🟢 Local-testable — ✅ COMPLETE
Each has a local image/file with a real live-container integration test. All shipped.

| DB | Local image / driver | Notes |
|---|---|---|
| ✅ SQLite | file, no server (sql.js, pure JS) | **shipped** — `src/adapters/sqlite/`, `path` field, writes persist to the file; real IT runs in `npm test` (no container) |
| ✅ MariaDB | `mariadb` | **shipped** — no new adapter; use the `mysql` adapter (MySQL wire protocol, verified against a real MariaDB container) |
| ✅ MongoDB | `mongo` | **shipped** — `src/adapters/mongodb/`, `db.coll.method(json)` surface, collections→sampled-fields tree, skip/limit paging |
| ✅ MS SQL Server | `mcr.microsoft.com/mssql/server` | **shipped** — `src/adapters/mssql/`, tedious driver, `information_schema` tree; fetch+slice paging (T-SQL has no LIMIT) |
| ✅ ClickHouse | `clickhouse/clickhouse-server` | **shipped** — `src/adapters/clickhouse/`, HTTP driver, `system.*` schema tree, optional password auth |
| ✅ Neo4j | `neo4j` | **shipped** — `src/adapters/neo4j/`, Cypher over Bolt, labels→properties tree, own Cypher completion, SKIP/LIMIT paging |
| ✅ Cassandra / ScyllaDB | `cassandra` / `scylladb/scylla` | **shipped** — `src/adapters/cassandra/`, CQL, native `pageState` paging, `system_schema.*` tree (ScyllaDB is CQL-compatible) |
| ✅ Elasticsearch / OpenSearch | `elasticsearch` / `opensearchproject/opensearch` | **shipped** — `src/adapters/elasticsearch/`, `METHOD /path {json}` console, `_search`→rows with from/size paging, indices→mapping tree |
| ✅ Kafka | `apache/kafka` | **shipped** — `src/adapters/kafka/`, KRaft single-node; `topics`/`describe`/`consume` commands, topics→partitions tree |

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

**Domain (checked 2026-07-11, RDAP = availability only, price approx):** `.com/.dev/.app/.io/.xyz/.ai` all **taken** — .com/.dev/.app held by the existing *Tuple* pair-programming app (brand-collision risk). **Available:** `tuple.tools` (~$12–15/yr flat, on-theme — cheap pick), `tuple.me` (~$18), `tuple.co` (~$25–30), `tuple.io`/`.sh` (~$32–40). Cheapest no-markup registrar: Cloudflare / Porkbun. Exact-name collision may push toward a stem (`tupledb`, `usetuple`).

### 🔒 4. Publishing — the final goal *(needs the owner's Azure DevOps / Entra account)*

- Publisher setup + first pre-release (Entra ID auth; icon/keywords/manifest; odd/even minor = pre-release/release)
- Open VSX too (Cursor / Windsurf / VSCodium)
- CI publish-on-tag + THIRD-PARTY-NOTICES generation
- Monetization seam only: `license.ts` with `isProEnabled() => true`
- CHANGELOG.md + README screenshots/gif (page quality drives installs)
- Public website / landing page — install links, docs, screenshots, gifs

### Dev environment parity *(chore)*

Every DB type shipped in `docker-compose.yml` should be seeded **and** pre-wired in the dev config, so launching the Extension Development Host (F5 / ▶) shows a live connection for each engine with no manual setup.

- **Seeds** — all present: Postgres/MySQL/MariaDB seed on container init (`dev/seed/<db>` → `/docker-entrypoint-initdb.d`); Redis + DynamoDB via `db:seed`; SQLite via `db:sqlite`.
- **Connections — gap:** `dev/playground/.rowboat.json` has `local-pg`, `local-redis`, `local-dynamo`, `local-sqlite` but is **missing MySQL and MariaDB** (both have compose services + seeds). Add `local-mysql` + `local-mariadb` entries.
- Keep in parity as new local-testable adapters land (§1a): each new compose service gets a seed **and** a dev-config connection in the same change.

---

## After launch

### 5. Schema explorer / ER diagram *(easy)*

Pick tables and plot them on a canvas with the relationships drawn between them — an ER-style view. Mostly for the SQL engines (Postgres/MySQL/MS SQL): read foreign keys from the catalog (`information_schema.key_column_usage` + `table_constraints`, or `pg_constraint`) so each edge is a real FK reference; nodes show the table's columns with PK/FK badges. A webview canvas reusing the existing results/webview pattern; start from a selection of tables in the explorer.

### 6. Table filter in the explorer

For a connection with many tables, a filter/search box to narrow the schema tree to matching tables (and optionally columns) instead of scrolling the whole list. Client-side filter over the loaded tree, backed by the adapter's existing `searchItems` for very large schemas.

### 7. Per-engine entity refinement *(investigate first)*

Surface more database objects than tables/columns/keys — **views**, materialized views, **stored procedures / functions**, triggers, sequences, indexes, enums, etc. — as their own tree node kinds per connection, with sensible actions (open definition, run). Which objects are worth showing (and how to browse/execute them) differs by engine, so this needs a short investigation per adapter before building.

### 8. Local search in the result tab

Client-side find within the current result tab — a search box that filters/highlights matching cells in the loaded grid, with highlight + scroll-to-match (next/prev navigation). Local only: searches the rows already loaded in the webview, no re-query to the database. Reuse the existing results/webview pattern; `cmd+f` in the result tab opens it.

---

## Not scheduled

**Later / pro** — skipped by design: grid cell editing with write-back · EXPLAIN visualizer · telemetry.

**Open polish:**
- SQL completion for table-qualified columns without an alias (`FROM crew … crew.id`).
- 🐛 Result grid header, dark mode: hover state renders white text on white background (unreadable). Fix hover fg/bg to use theme header tokens.
