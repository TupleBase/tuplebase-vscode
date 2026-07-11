# MCP server — let agents query your databases

Rowboat ships a standalone [Model Context Protocol](https://modelcontextprotocol.io)
server that exposes your configured connections to AI agents. It reuses the same
adapters, config parser and read-only guardrail as the extension, and runs as a plain
Node process over stdio — no VS Code required at run time.

**Read-only for agents by default.** Writes are blocked unless you explicitly opt in
(see [Allowing writes](#allowing-writes)).

## Tools

| Tool | Arguments | Returns |
|---|---|---|
| `list_connections` | — | every connection (name, group, adapter, whether writes are allowed, whether it tunnels over SSH) |
| `inspect_schema` | `connection`, optional `nodeId` + `kind` | schema tree children — omit `nodeId` for the top level (postgres schemas / dynamo tables / redis key namespaces), pass a node's `id`+`kind` from a previous result to drill in |
| `run_query` | `connection`, `statement` | one SQL / PartiQL statement or redis command, as `{ columns, rows, rowCount, elapsedMs, warnings }` (rows are objects). Writes are rejected unless enabled. |

## How to run it

The server is `dist/mcp/server.js` (built by `npm run build`). It reads:

- **`ROWBOAT_CONFIG`** — path to your `.rowboat.json` (falls back to `argv[2]`, then `./.rowboat.json`).
- **`ROWBOAT_SECRET_<CONN>_<FIELD>`** — each connection's secret (e.g. `ROWBOAT_SECRET_APP_DB_PASSWORD`). The connection name and field are uppercased with non-alphanumerics collapsed to `_`. The server can't read VS Code's keychain, so secrets arrive as env vars.
- **`ROWBOAT_MCP_ALLOW_WRITES`** — `1`/`true` to permit writes (still subject to each connection's `readonly`).
- **`ROWBOAT_MCP_MAX_ROWS`** — row cap per query (default 200).

### Get the config from VS Code (recommended)

Run **Rowboat: Show MCP Server Config** from the command palette. It opens a ready-to-paste
client config that points at the bundled server, sets `ROWBOAT_CONFIG`, and fills in each
connection's `ROWBOAT_SECRET_*` **from the OS keychain** — so you don't handle secrets by hand:

```jsonc
{
  "mcpServers": {
    "rowboat": {
      "command": "node",
      "args": ["/abs/path/to/dist/mcp/server.js"],
      "env": {
        "ROWBOAT_CONFIG": "/abs/path/to/.rowboat.json",
        "ROWBOAT_SECRET_APP_DB_PASSWORD": "…"
      }
    }
  }
}
```

> The generated config contains your stored secrets in plaintext — treat it like any
> other credentials file. Connections whose secret isn't in the keychain yet are listed;
> connect them once in Rowboat, then regenerate.

## Verifying it's running

- **Startup** — the server logs to **stderr** (stdout is the protocol): `[rowboat-mcp] ready — N connection(s) (read-only)`. Config problems are logged as `[rowboat-mcp] config: …`.
- **Smoke test the tools** — from your MCP client:
  1. `list_connections` → your connections appear, each with `readonly: true` (default).
  2. `inspect_schema { connection: "app-db" }` → top-level schema nodes.
  3. `run_query { connection: "app-db", statement: "select 1 as one" }` → `{ "one": 1 }`.
  4. `run_query` with a write (e.g. `delete …`) → **blocked** with `read-only for agents`. That confirms the guardrail.

## Clients

Any MCP client that speaks stdio works. The config snippet above is the shape each expects
(often under a `mcpServers` / `servers` key):

| Client | Notes |
|---|---|
| Claude Desktop | `mcpServers` in the desktop config; verified shape above. |
| VS Code Copilot (agent mode) | add under `mcp.servers`; the same `command`/`args`/`env`. |
| Cline / Continue / other editors | expected to work — standard stdio MCP; use the same snippet. |

(Verified end-to-end against the reference MCP client driving the server over stdio; individual
GUI clients are expected-to-work with the snippet above.)

## Allowing writes

Agents are read-only by default. To let an agent write, start the server with
`ROWBOAT_MCP_ALLOW_WRITES=1` **and** make sure the target connection isn't `readonly` in
`.rowboat.json`. Both must hold — a `readonly` connection stays read-only even with writes
enabled.

## Troubleshooting

- **No connections listed** — `ROWBOAT_CONFIG` is wrong or the file failed to parse. Check the `[rowboat-mcp] config:` stderr lines.
- **"Missing secret … set ROWBOAT_SECRET_…"** — that connection's secret isn't in the env. Regenerate the config from VS Code after connecting the connection once (so the secret is in the keychain), or set the env var yourself.
- **Writes rejected** — expected unless `ROWBOAT_MCP_ALLOW_WRITES=1` and the connection is not `readonly`.
- **A connection can't connect** — the standalone server uses the same drivers/tunnels as the extension; a config or network issue there affects it too. `list_connections` still works even if one connection can't connect.
