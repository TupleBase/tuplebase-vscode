# Testing Rowboat

## Prerequisites

```bash
nvm use            # node 24 (.nvmrc)
npm install
npm run db:postgres   # dockerized postgres on :5432, seeded (password: rowboat)
npm run db:redis      # dockerized redis on :6379, seeded
```

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
   - **Password prompt** — first connection asks for the password (`rowboat`) and stores it in the OS keychain (VS Code SecretStorage). It won't ask again.

While `watch` is running, reload the dev host with **cmd+R** after a code change. Breakpoints in `src/` hit in the main window's debugger.

## Automated tests

Three layers:

```bash
npm test                 # unit (vitest) — no external dependencies
RB_IT=1 npx vitest run   # unit + integration — needs `npm run db:postgres` + `npm run db:redis`
npm run test:vscode      # extension-host smoke test — downloads VS Code, launches the
                         # extension inside it, runs @vscode/test suite
```

CI runs all three on every push and PR (`.github/workflows/ci.yml`), with postgres via docker compose and the smoke test under `xvfb-run`.

## Resetting state

- **Database**: `docker compose --profile postgres down -v && npm run db:postgres` re-creates and re-seeds (redis: `npm run db:redis` re-seeds in place — the seed starts with `FLUSHALL`).
- **Stored password**: in the dev host, run **Rowboat: Clear Stored Credentials** from the command palette. (Secrets are keyed by environment + connection name, so renaming a connection in `.rowboat.json` also triggers a fresh prompt.)
