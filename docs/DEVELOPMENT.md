# Developing locally

Node runs on your machine (the F5 debug flow needs local VS Code); every database runs in docker. Prerequisites: **Node 24** (`nvm use`) and **Docker**.

## Setup & run

```bash
nvm use && npm install
npm run db:postgres   # dockerized postgres, seeded (password: rowboat)
npm run watch         # esbuild watch, leave running
```

Press **F5** in VS Code (two configs in `.vscode/launch.json`):

- **Run Extension** — dev host opens `dev/playground`; its `.rowboat.json` is pre-wired to every engine and `scratch.sql` is ready — run with **cmd+enter**.
- **Run Extension (empty workspace)** — dev host opens `dev/empty-ws` (no config), for the welcome view and Create Config flow.

**cmd+R** in the dev host reloads after a code change; breakpoints in `src/` hit in the main window. The first connect prompts for the password (`rowboat`) and stores it in the OS keychain — it won't ask again.

## Databases

- `npm run db:<engine>` — start + seed one engine: `postgres`, `mysql`, `mariadb`, `sqlite` (no container — builds a demo file), `mssql`, `clickhouse`, `cassandra`, `neo4j`, `mongodb`, `elasticsearch`, `kafka`, `redis`, `dynamo`.
- `npm run db:all` — start + seed everything (heavy — mainly for the full integration suite, `RB_IT=1`).
- `npm run db:down` — stop all containers.

**Postgres is the default dev engine** — lightest, and `scratch.sql` targets it; one engine exercises the whole extension path. Ports and images are in `docker-compose.yml`; seeds in `dev/seed/<engine>/`.

## Reseed & reset

- **postgres / mysql / mariadb / clickhouse** seed via the image's init hook — reseed needs a fresh volume: `docker compose --profile <engine> down -v && npm run db:<engine>`.
- **All other engines** reseed in place — `npm run db:seed -- <engine>` (or re-run `npm run db:<engine>`; the redis seed starts with `FLUSHALL`). Bare `npm run db:seed` reseeds them all.
- **High-volume paging data** (additive, opt-in): `npm run db:seed:big` — or one engine: `npm run db:seed:big -- postgres` (works for every engine).
- **Stored password**: run **Rowboat: Clear Stored Credentials** (or per-connection **Reset Credentials**) from the dev host command palette.

### Targeting one engine: the `--` matters

npm only forwards arguments that come after a standalone `--`. Anything written as a flag before it is parsed as npm's own config and silently dropped (`npm warn Unknown cli config`) — and the seed script, receiving no engine, falls back to seeding **all** of them.

```bash
npm run db:seed -- kafka        # ✓ reseed kafka only
npm run db:seed:big -- kafka    # ✓ big paging data for kafka only
npm run db:seed:big --kafka     # ✗ npm eats "--kafka" → seeds every engine
```

## Checks & tests

```bash
npm run check   # tsc --noEmit
npm test        # unit + SQLite integration — no containers needed
```

Live-container integration tests, the VS Code smoke test and the manual checklist: [TESTING.md](TESTING.md).
