# Developing locally

Node runs on your machine (the F5 debug flow needs local VS Code); every database runs in docker. Prerequisites: **Node 24** (`nvm use`) and **Docker**.

## Setup & run

```bash
nvm use && npm install
npm run db:start -- postgres   # dockerized postgres (password: tuplebase)
npm run db:seed -- postgres    # demo data — drops and recreates, rerun anytime
npm run watch         # esbuild watch, leave running
```

Press **F5** in VS Code (two configs in `.vscode/launch.json`):

- **Run Extension** — dev host opens `dev/playground`; its `.tuplebase.json` is pre-wired to every engine and `scratch-postgres.sql` is ready — run with **cmd+enter**. Note: only adapters listed in `ENABLED_ADAPTER_IDS` (`src/adapters/registry.ts`) appear in the dev host — currently just `postgres`; the other connections are silently skipped. To develop or exercise another engine, temporarily add its id to that list locally.
- **Run Extension (empty workspace)** — dev host opens `dev/empty-ws` (no config), for the welcome view and Create Config flow.

**cmd+R** in the dev host reloads after a code change; breakpoints in `src/` hit in the main window. The first connect prompts for the password (`tuplebase`) and stores it in the OS keychain — it won't ask again.

## Databases

- `npm run db:start -- <engine|all>` — start container(s); never touches existing data. Engines: `postgres`, `mysql`, `mariadb`, `sqlite` (no container — builds a demo file if missing), `mssql`, `clickhouse`, `cassandra`, `neo4j`, `mongodb`, `elasticsearch`, `kafka`, `redis`, `dynamo`. `all` is heavy — mainly for the full integration suite, `TUPLEBASE_IT=1`.
- `npm run db:seed -- [engine]` — (re)seed running container(s) in place, including the high-volume paging data; bare seeds every engine. A fresh container is empty until seeded.
- `npm run db:down` — stop all containers.

Each of these is also a VS Code task (`Terminal → Run Task…`, prefixed `db:`) — per-engine start and seed, plus all/down.

**Postgres is the default dev engine** — lightest, and `scratch-postgres.sql` targets it; one engine exercises the whole extension path. Ports and images are in `docker-compose.yml`; seeds in `dev/seed/<engine>/`.

## Reseed & reset

- **After updating from a pre-rename checkout**, recreate local containers because the development database names and credentials changed to `tuplebase`: `docker compose --profile all down -v`.
- **Every engine reseeds in place** — `npm run db:seed -- <engine>`. Seed scripts drop and recreate their objects; the redis seed starts with `FLUSHALL`. Bare `npm run db:seed` reseeds them all. Every seed includes the high-volume paging dataset (`pagination_demo` tables, `pagedemo:*` keys, …).
- **Stored password**: run **TupleBase: Clear Stored Credentials** (or per-connection **Reset Credentials**) from the dev host command palette.

### Targeting one engine: the `--` matters

npm only forwards arguments that come after a standalone `--`. Anything written as a flag before it is parsed as npm's own config and silently dropped (`npm warn Unknown cli config`) — and the seed script, receiving no engine, falls back to seeding **all** of them.

```bash
npm run db:start -- kafka       # ✓ start kafka without touching its data
npm run db:seed -- kafka        # ✓ (re)seed kafka only
```

## Checks & tests

```bash
npm run check   # tsc --noEmit
npm test        # unit + SQLite integration — no containers needed
```

Live-container integration tests, the VS Code smoke test and the manual checklist: [TESTING.md](TESTING.md).
