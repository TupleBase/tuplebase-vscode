# Testing Rowboat

## Prerequisites

```bash
nvm use            # node 24 (.nvmrc)
npm install
npm run db:postgres   # dockerized postgres on :5432, seeded (password: rowboat)
npm run db:redis      # dockerized redis on :6379, seeded
npm run db:dynamo     # dockerized dynamodb-local on :8000, seeded
npm run db:sqlite     # builds the dev SQLite demo file (dev/seed/sqlite/demo.sqlite) — no container
npm run db:mariadb    # dockerized MariaDB on :3307, seeded (reached via the mysql adapter)
npm run db:clickhouse # dockerized ClickHouse on :8123, seeded
npm run db:seed:big   # opt-in high-volume seeds for paging (pg 10k rows, redis 5k keys, dynamo 2k items)
```

`db:seed:big` runs against the already-started containers and is additive; use the per-engine variants (`db:seed:big:postgres` / `:redis` / `:dynamo`) to load just one.

## Manual testing (Extension Development Host)

The main way to try the extension while developing:

```bash
npm run watch   # esbuild watch, leave running
```

1. Open this repo in VS Code and press **F5** (Run → Start Debugging). Two launch configs exist:
   - **Run Extension** — dev host opens `dev/playground` (its `.rowboat.json` points at the dockerized postgres, and `scratch.sql` is ready to run). The dev host gets its own folder because VS Code won't open a folder that's already open in another window — pointing it at this repo would silently give you an empty window.
   - **Run Extension (empty workspace)** — dev host opens `dev/empty-ws` (no config) to exercise the welcome view and the Create Config flow.
2. A new window opens — the Extension Development Host — with the extension loaded.
3. Things to exercise:
   - **Schema explorer** — Rowboat icon in the activity bar; expand schemas and tables.
   - **Environment picker** — status bar item; switch environments.
   - **Run a query** — open a `.sql` file, write a query, press **cmd+enter**. Results render in the Tabulator grid with paging and cancel.
   - **Redis** — open `scratch.redis` (one command per line, `#` comments), cursor on a line, **cmd+enter**. The explorer shows key namespaces grouped on `:`.
   - **Fixtures** — the local harbor dataset includes joined Postgres tables, Redis strings/hashes/lists/sets/sorted sets/streams, and DynamoDB composite-key tables with LSI/GSI metadata and nested document values.
   - **Password prompt** — first connection asks for the password (`rowboat`) and stores it in the OS keychain (VS Code SecretStorage). It won't ask again.

While `watch` is running, reload the dev host with **cmd+R** after a code change. Breakpoints in `src/` hit in the main window's debugger.

## Automated tests

Three layers:

```bash
npm test                 # unit + SQLite integration (vitest) — no external services (SQLite is file-based)
RB_IT=1 npx vitest run   # unit + integration — needs db:postgres + db:mysql + db:mariadb + db:clickhouse + db:redis + db:dynamo
npm run test:vscode      # extension-host smoke test — downloads VS Code, launches the
                         # extension inside it, runs @vscode/test suite
```

CI runs all three on every push and PR (`.github/workflows/ci.yml`), with postgres via docker compose and the smoke test under `xvfb-run`.

## Resetting state

- **Database**: `docker compose --profile postgres down -v && npm run db:postgres` re-creates and re-seeds (redis: `npm run db:redis` re-seeds in place — the seed starts with `FLUSHALL`).
- **Stored password**: in the dev host, run **Rowboat: Clear Stored Credentials** from the command palette. (Secrets are keyed by environment + connection name, so renaming a connection in `.rowboat.json` also triggers a fresh prompt.)
