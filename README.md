# TupleBase

One workspace for every database. TupleBase is a VS Code extension for querying Postgres, MySQL, SQLite, SQL Server, ClickHouse, Cassandra, Neo4j, MongoDB, Elasticsearch, Kafka, Redis and DynamoDB behind one extensible adapter interface. Connections live in a committable, secret-free `.tuplebase.json` (passwords in the OS keychain, SSH tunnels for bastions), queries run from files into a VS Code-themed results grid, and a bundled [MCP server](docs/MCP.md) lets AI agents query the same connections — read-only by default. Only marketplace publishing remains.

## Quick start (development)

```bash
nvm use && npm install
npm run db:postgres      # dockerized postgres, seeded (password: tuplebase)
npm run watch            # esbuild watch
```

Press **F5** in VS Code → the Extension Development Host opens `dev/playground` with `scratch.sql` pointed at the docker postgres; run a query with **cmd+enter**.

Full guide — launch configs, all 13 local databases, seeding/reseeding, resetting state: **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)**.

## Migrating from Rowboat

TupleBase still discovers and validates `.rowboat.json` during the pre-release migration window. When only the legacy file exists, the extension loads it and offers to rename it to `.tuplebase.json`; when both exist, `.tuplebase.json` wins. The renamed extension has separate VS Code storage, so existing development installs must select file connections and enter stored credentials once again. Legacy `ROWBOAT_*` MCP environment variables are also accepted, with `TUPLEBASE_*` taking precedence.

## Docs

| Doc | What's in it |
|---|---|
| [DEVELOPMENT.md](docs/DEVELOPMENT.md) | Develop locally — F5 flow, local databases, seed/reseed, resetting state |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | How it works — adapters, registry, `.tuplebase.json` config, secrets, SSH tunnels, query flow, build |
| [DATABASES.md](docs/DATABASES.md) | Supported engines + the add-an-adapter checklist |
| [TESTING.md](docs/TESTING.md) | Test layers (unit / integration / VS Code smoke), CI, manual checklist |
| [MCP.md](docs/MCP.md) | MCP server — running it, clients, allowing writes, troubleshooting |
