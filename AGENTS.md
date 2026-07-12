# Agent guide

TupleBase is a VS Code extension for querying 12+ database engines through one adapter interface, with a bundled MCP server. What it is and the full doc index: [README.md](README.md).

Project management (roadmap, task board, cross-department decisions) lives in the sibling repo [`tuplebase-project`](https://github.com/TupleBase/tuplebase-project), not here — this repo is code + its own docs only.

## Verify your changes

```bash
npm run check   # tsc --noEmit
npm test        # unit + SQLite integration — no containers needed
```

Run both after every change; they are the fast CI-equivalent bar. Container-backed integration tests (`TUPLEBASE_IT=1`), the VS Code smoke test, and how CI splits jobs: [docs/TESTING.md](docs/TESTING.md).

## Find the right doc before coding

| Task | Read |
|---|---|
| Run the extension locally, start/seed/reset databases | [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) |
| Understand code structure — adapters, registry, config, secrets, query flow, build | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Add or change a database adapter | Checklist in [docs/DATABASES.md](docs/DATABASES.md), seams in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#adding-a-database-type) |
| Anything MCP server | [docs/MCP.md](docs/MCP.md) |
| Test layers, CI behavior, manual checklist | [docs/TESTING.md](docs/TESTING.md) |

Don't guess at seams or engine specifics from file names — the docs above are current and short.

## Conventions

- Commits: Conventional Commits, lowercase subject — `fix(dev): pin mssql image to linux/amd64`. No AI attribution.
- `npm run build` regenerates the `.tuplebase.json` schema first (`gen:schema`); never edit generated schema output by hand.
- Docs are the source of truth. When a change makes them stale, update the relevant doc in the same commit instead of adding new files or duplicating content here.
