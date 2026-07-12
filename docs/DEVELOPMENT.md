# Developing locally

Everything you need to hack on Rowboat: set up, run the extension, start local databases, seed/reseed, reset state.

## Prerequisites

- **Node 24** — `nvm use` (reads `.nvmrc`)
- **Docker** — for the local database containers (SQLite is the only engine that needs none)

```bash
nvm use
npm install
```

## Run the extension

```bash
npm run db:postgres   # start + seed the default dev database
npm run watch         # esbuild watch, leave running
```

Then in VS Code, press **F5** (Run → Start Debugging). Two launch configs (`.vscode/launch.json`):

- **Run Extension** — opens the dev host on `dev/playground`, whose `.rowboat.json` already points at the dockerized postgres; `scratch.sql` is ready to run with **cmd+enter**. (The dev host gets its own folder because VS Code won't re-open a folder that's already open — pointing it at this repo would silently give you an empty window.)
- **Run Extension (empty workspace)** — opens `dev/empty-ws` (no config) to exercise the welcome view and the Create Config flow.

Dev loop: while `watch` runs, press **cmd+R** in the dev host to reload after a code change. Breakpoints in `src/` hit in the main window's debugger.

First connection prompts for the password (`rowboat`) and stores it in the OS keychain — it won't ask again (see [Resetting state](#resetting-state)).

## Local databases

Each engine has a compose profile + seed. **Postgres is the default dev engine** — lightest container, fastest boot, and the playground's `scratch.sql` targets it; one engine exercises the whole extension path (explorer, binding, grid, keychain). Start only what you're working on — `db:all` is heavy (SQL Server, Cassandra, Elasticsearch, Kafka) and mainly useful for the full integration suite (`RB_IT=1`, see [TESTING.md](TESTING.md)) or cross-engine work:

```bash
npm run db:postgres      # :5432 — the default dev database (password: rowboat)
npm run db:mysql         # :3306
npm run db:mariadb       # :3307 (reached via the mysql adapter)
npm run db:sqlite        # no container — builds dev/seed/sqlite/demo.sqlite
npm run db:mssql         # :1433 (heavy image)
npm run db:clickhouse    # :8123
npm run db:cassandra     # :9042 (slow JVM boot)
npm run db:neo4j         # :7687 Bolt / :7474
npm run db:mongodb       # :27017
npm run db:elasticsearch # :9200 (heavy image)
npm run db:kafka         # :9092
npm run db:redis         # :6379
npm run db:dynamo        # :8000 (dynamodb-local)

npm run db:all           # everything at once (heavy — needs lots of RAM)
npm run db:down          # stop all containers
```

All are seeded on start with the harbor demo dataset (`dev/seed/<engine>/`). The playground's `.rowboat.json` has a connection for every engine.

## Seeding & reseeding

Seeds run automatically when a container starts. To reseed:

- **Init-hook engines (postgres, mysql, mariadb, clickhouse)** — seeds run from the image's init hook, so a reseed needs a fresh volume:

  ```bash
  docker compose --profile postgres down -v && npm run db:postgres
  ```

- **Script-seeded engines (redis, dynamo, mssql, cassandra, neo4j, mongodb, elasticsearch, kafka)** — re-run `npm run db:<engine>`; the seed script re-applies in place (the redis seed starts with `FLUSHALL`).

- **High-volume seeds for paging** (additive, opt-in — run after the containers are up):

  ```bash
  npm run db:seed:big             # pg 10k rows, redis 5k keys, dynamo 2k items
  npm run db:seed:big:postgres    # …or just one engine (:redis / :dynamo)
  ```

## Resetting state

- **Database** — see reseeding above (`down -v` + restart for SQL engines).
- **Stored password** — in the dev host, run **Rowboat: Clear Stored Credentials** from the command palette, or per-connection **Reset Credentials**. Secrets are keyed by group + connection name, so renaming a connection also triggers a fresh prompt.
- **File→connection bindings** live in `workspaceState` and reset when you delete the dev host's workspace storage (rarely needed).

## Checks & tests

```bash
npm run check   # tsc --noEmit
npm test        # unit + SQLite integration (vitest) — no containers needed
```

Integration tests against live containers, the VS Code smoke test, and the manual-testing checklist: see [TESTING.md](TESTING.md).
