# Rowboat 🛶

Paddle through your rows. A VS Code extension for querying databases — Postgres, MySQL, SQLite, SQL Server, ClickHouse, Cassandra, Neo4j, MongoDB, Elasticsearch, Kafka, Redis and DynamoDB behind one extensible adapter interface, plus an [MCP server](docs/MCP.md) so AI agents can query the same connections.

**What you get:** group-organised connections in a committable, secret-free `.rowboat.json` (passwords live in the OS keychain), a schema explorer, per-engine autocomplete + history, queries into a VS Code-themed results grid with paging and a JSON detail view, per-connection SSH tunnels for databases behind a bastion, and connection create/edit entirely from the UI. Only marketplace publishing remains — see the [roadmap](docs/ROADMAP.md).

## Quick start (development)

```bash
nvm use && npm install
npm run db:postgres      # dockerized postgres, seeded (password: rowboat)
npm run watch            # esbuild watch
```

Press **F5** in VS Code → the Extension Development Host opens `dev/playground` with `scratch.sql` pointed at the docker postgres; run a query with **cmd+enter**.

Full guide — launch configs, all 13 local databases, seeding/reseeding, resetting state: **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)**.

## Config in one paragraph

`.rowboat.json` at your workspace root: `{ "version": 1, "groups": { "<group>": { "<connection>": { "adapter": "postgres", ... } } } }`. Groups are folders; a query runs against the connection bound to its file. Set `"readonly": true` (per connection or as a group default) to block writes. Passwords are prompted once and keychained — never in the file. Add an `ssh` block to reach a database through a bastion. The JSON schema gives IntelliSense in the file; full detail (secrets, tunnels, the CRUD flow) in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#connections--config).

## MCP server

A standalone [Model Context Protocol](https://modelcontextprotocol.io) server exposes `list_connections`, `inspect_schema` and `run_query` over the same adapters and config — **read-only for agents by default**. Run **Rowboat: Show MCP Server Config** from the command palette for a ready-to-paste client config. Full guide: [docs/MCP.md](docs/MCP.md).

## Docs

| Doc | What's in it |
|---|---|
| [DEVELOPMENT.md](docs/DEVELOPMENT.md) | Develop locally — F5 flow, local databases, seed/reseed, resetting state |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | How it works — adapters, registry, connections & config, query flow, build |
| [DATABASES.md](docs/DATABASES.md) | Supported engines + the add-an-adapter checklist |
| [TESTING.md](docs/TESTING.md) | Test layers (unit / integration / VS Code smoke), CI, manual checklist |
| [MCP.md](docs/MCP.md) | MCP server — running it, clients, allowing writes, troubleshooting |
| [ROADMAP.md](docs/ROADMAP.md) | What's shipped, what remains |
