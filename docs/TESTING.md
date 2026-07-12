# Testing Rowboat

## Prerequisites

Setup, launch configs and the per-engine `db:<engine>` container commands (start, seed, reseed) live in [DEVELOPMENT.md](DEVELOPMENT.md). Start the engines the tests you're running need — or `npm run db:all` for everything.

## Manual testing (Extension Development Host)

Run the extension per [DEVELOPMENT.md](DEVELOPMENT.md#run-the-extension) (`npm run watch` + **F5**), then exercise:

- **Schema explorer** — Rowboat icon in the activity bar; expand schemas and tables.
- **Connection binding** — first run on an unbound file prompts a connection picker; the binding sticks per file.
- **Run a query** — open a `.sql` file, write a query, press **cmd+enter**. Results render in the Tabulator grid with paging and cancel.
- **Redis** — open `scratch.redis` (one command per line, `#` comments), cursor on a line, **cmd+enter**. The explorer shows key namespaces grouped on `:`.
- **Fixtures** — the local harbor dataset includes joined Postgres tables, Redis strings/hashes/lists/sets/sorted sets/streams, and DynamoDB composite-key tables with LSI/GSI metadata and nested document values.
- **Password prompt** — first connection asks for the password (`rowboat`) and stores it in the OS keychain (VS Code SecretStorage). It won't ask again.

## Automated tests

Three layers:

```bash
npm test                 # unit + SQLite integration (vitest) — no external services (SQLite is file-based)
RB_IT=1 npx vitest run   # unit + integration — needs each db:<engine> up (postgres, mysql, mariadb, mssql, clickhouse, cassandra, neo4j, mongodb, elasticsearch, kafka, redis, dynamo). `npm run db:all` starts them all.
npm run test:vscode      # extension-host smoke test — downloads VS Code, launches the
                         # extension inside it, runs @vscode/test suite
```

CI (`.github/workflows/ci.yml`) runs on every push and PR as two jobs: a **unit** job (check + build + `npm test` + VS Code smoke, no containers) and an **integration** matrix — one job per engine, each booting only its own container and running that adapter's IT. The heavy images (SQL Server, Cassandra, Elasticsearch, …) can't all co-reside on a single runner, so they're split per job rather than run together.

## Resetting state

Reseeding databases and clearing stored credentials: see [DEVELOPMENT.md](DEVELOPMENT.md#resetting-state).
