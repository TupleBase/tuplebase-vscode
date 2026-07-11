# Rowboat 🛶

Paddle through your rows. A VS Code extension for querying databases — Postgres, Redis and DynamoDB behind one extensible adapter interface.

## Status

Postgres, Redis and DynamoDB end-to-end: group-organised connections in a secret-free `.rowboat.json`, schema explorer, per-engine autocomplete + history, and queries into a VS Code-themed results grid (result tabs, JSON detail view). Connections are created and edited entirely from the UI. Each database is a self-contained adapter plugin under `src/adapters/<db>/`. Reach databases behind a bastion with per-connection SSH tunnels, and expose the same connections to AI agents through a read-only-by-default [MCP server](#mcp-server). See [docs/ROADMAP.md](docs/ROADMAP.md) — only publishing to the marketplace remains.

## Development

```bash
npm install
npm run db:postgres      # dockerized postgres, seeded (password: rowboat)
npm run watch            # esbuild watch
# press F5 → Extension Development Host opens dev/playground (its .rowboat.json points at the docker postgres)
```

**How it works** (adapters, connections, the registry, build): see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
Testing (manual dev-host flow, test layers, resetting state): see [docs/TESTING.md](docs/TESTING.md).

## Config

`.rowboat.json` at your workspace root — committable, secret-free. Passwords are prompted once and stored in your OS keychain (VS Code SecretStorage). See the JSON schema for fields (IntelliSense works in the file).

Shape: `{ "version": 1, "groups": { "<group>": { "<connection>": { "adapter": "postgres" | "mysql" | "redis" | "dynamodb", ... } } } }`. Groups are folders that organise connections; a query runs against the connection bound to its file (there is no active environment). Set `"readonly": true` on a connection — or as a group default — to block writes.

Multi-root workspaces: config resolves from the **first** workspace folder only.

### SSH tunnels

Reach a database behind a bastion / jump host by adding an `ssh` block to a host/port connection (postgres, redis):

```jsonc
"prod-pg": {
  "adapter": "postgres", "host": "10.0.1.5", "database": "app", "user": "app",
  "ssh": { "host": "bastion.example.com", "user": "ec2-user", "privateKey": "~/.ssh/id_ed25519" }
}
```

The `host`/`user`/`privateKey` path stay in the file; a key passphrase or SSH password (`"passphrase": true` / `"password": true`) is prompted once and kept in the keychain. Rowboat forwards a local port through the bastion and connects the adapter through it.

## MCP server

Rowboat ships a standalone [Model Context Protocol](https://modelcontextprotocol.io) server so AI agents can query your configured databases. It exposes three tools — `list_connections`, `inspect_schema`, `run_query` — over the same adapters, config and read-only guardrail as the extension, and is **read-only for agents by default** (writes are blocked unless started with `ROWBOAT_MCP_ALLOW_WRITES=1` and the connection isn't `readonly`).

Run **Rowboat: Show MCP Server Config** from the command palette to get a ready-to-paste client config — it points at the bundled server, your `.rowboat.json`, and injects each connection's secret from the OS keychain as an env var. Point it at Postgres, Redis or DynamoDB and any MCP client (Claude Desktop, editors, …) can discover connections, browse schema and run queries.

Full guide — running it, verifying, clients, allowing writes, troubleshooting: [docs/MCP.md](docs/MCP.md).
