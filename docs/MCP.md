# MCP server — let agents query your databases

TupleBase ships a standalone [Model Context Protocol](https://modelcontextprotocol.io)
server that exposes your configured connections to AI agents. It reuses the same
adapters, config parser and read-only guardrail as the extension, and runs as a plain
Node process over stdio — no VS Code required at run time.

**Read-only for agents by default.** Writes are blocked unless you explicitly opt in
(see [Allowing writes](#allowing-writes)).

## How it relates to the extension

```text
VS Code Agent / Codex / another MCP client
                  │ stdio
                  ▼
          dist/mcp/server.js
             │         │
     .tuplebase.json    └─ environment secrets
             │
             ▼
       adapter → database
```

The MCP server reuses the extension's **configuration and adapter implementations**,
but it is a separate process. It does not borrow an already-open extension connection
or read VS Code SecretStorage directly. Schema inspection and queries open their own
database connection on demand and cache it for the lifetime of the MCP server.

The **TupleBase: Show MCP Server Config** command bridges the secret-storage gap: it
generates a client configuration using the current `.tuplebase.json`, bundled server,
and credentials already stored by the extension.

## Tools

| Tool | Arguments | Returns |
|---|---|---|
| `list_connections` | — | every connection (name, group, adapter, whether writes are allowed, whether it tunnels over SSH) |
| `inspect_schema` | `connection`, optional `nodeId` + `kind` | schema tree children — omit `nodeId` for the top level (postgres schemas / dynamo tables / redis key namespaces), pass a node's `id`+`kind` from a previous result to drill in |
| `run_query` | `connection`, `statement` | one SQL / PartiQL statement or redis command, as `{ columns, rows, rowCount, elapsedMs, warnings }` (rows are objects). Writes are rejected unless enabled. |

There is no separate `open_connection` tool today. `inspect_schema` and `run_query`
open and cache the requested connection automatically.

## Which agents can connect?

TupleBase is model-agnostic. Any **local MCP client with stdio support** can launch
the Node server and use its tools:

| Agent/client | Supported? | Setup |
|---|---|---|
| VS Code Agent mode / GitHub Copilot | Yes — recommended first | User or workspace `mcp.json`, then enable TupleBase in **Configure Tools** |
| Claude Code CLI | Yes | Local stdio server via [`claude mcp add`](https://code.claude.com/docs/en/mcp) |
| Codex app or CLI | Yes | Local stdio server via `codex mcp add` |
| Claude Desktop, Cline, Continue | Yes | Use their local `mcpServers` configuration |
| ChatGPT web, Claude Code web or another cloud-only agent | Not directly | A cloud agent cannot launch this local process or reach a local database; TupleBase would need a secured remote HTTP transport |

For Claude Code, copy the paths and secret environment entries produced by
**TupleBase: Show MCP Server Config** into this command:

```bash
claude mcp add --transport stdio \
  --env TUPLEBASE_CONFIG=/absolute/path/to/.tuplebase.json \
  --env TUPLEBASE_SECRET_APP_DB_PASSWORD=... \
  tuplebase -- node /absolute/path/to/dist/mcp/server.js
claude mcp list
# Inside Claude Code, /mcp shows server and tool status.
```

The equivalent Codex setup is:

```bash
codex mcp add \
  --env TUPLEBASE_CONFIG=/absolute/path/to/.tuplebase.json \
  --env TUPLEBASE_SECRET_APP_DB_PASSWORD=... \
  tuplebase -- node /absolute/path/to/dist/mcp/server.js
codex mcp list
# Start a new Codex session after adding the server.
```

Both commands store the supplied environment in local client configuration. Keep it
in user/local scope, never commit it, and treat it like the generated config because
it contains database credentials.

## Quickstart: VS Code Agent mode

VS Code Agent mode is the shortest path for using TupleBase because the database
extension, MCP configuration, tool picker and agent chat all live in the same editor.
VS Code stores local MCP configuration in `mcp.json`; see the official
[VS Code MCP server guide](https://code.visualstudio.com/docs/agent-customization/mcp-servers).

1. Build the development checkout with `npm run build` (skip this for an installed
   extension). Open each password-protected connection once so its credentials are in
   VS Code SecretStorage.
2. Run **TupleBase: Show MCP Server Config** from the Command Palette.
3. Run **MCP: Open User Configuration**. Use the user configuration rather than a
   committed workspace file because the generated environment contains plaintext
   credentials.
4. Copy the generated `tuplebase` entry into the `servers` object:

   ```jsonc
   {
     "servers": {
       "tuplebase": {
         "type": "stdio",
         "command": "node",
         "args": ["/absolute/path/to/dist/mcp/server.js"],
         "env": {
           "TUPLEBASE_CONFIG": "/absolute/path/to/.tuplebase.json",
           "TUPLEBASE_SECRET_APP_DB_PASSWORD": "…"
         }
       }
     }
   }
   ```

   The command currently generates the client-neutral `mcpServers` wrapper; VS Code's
   `mcp.json` uses the `servers` wrapper shown above. Keep the generated command,
   absolute paths and environment values unchanged.
5. Save the file, start `tuplebase` from the inline action or **MCP: List Servers**,
   and approve the local-server trust prompt. Use **Show Output** from the same menu
   if startup fails.
6. Open Chat, select **Agent**, choose **Configure Tools**, and enable the three
   `tuplebase` tools.

### Prove the agent is using TupleBase

Try these in order. Replace `local-pg` and the table names with your connection and
schema:

```text
Use the TupleBase tools to list my database connections. Do not infer them from files.
```

```text
Using the local-pg connection, inspect the schema until you find the public.crew table.
Tell me its columns. Do not run a query yet.
```

```text
Using TupleBase, answer: how many crew members are there? Show the SQL you ran and the result.
```

The expected tool flow is `list_connections` → one or more `inspect_schema` calls →
`run_query`. To verify the safety guardrail, ask the agent to run a harmlessly scoped
write statement in a disposable development database; it should receive
`read-only for agents` before the statement reaches the database.

## How to run it

The server is `dist/mcp/server.js` (built by `npm run build`). It reads:

- **`TUPLEBASE_CONFIG`** — path to your `.tuplebase.json` (falls back to `argv[2]`, then `./.tuplebase.json`).
- **`TUPLEBASE_SECRET_<CONN>_<FIELD>`** — each connection's secret (e.g. `TUPLEBASE_SECRET_APP_DB_PASSWORD`). The connection name and field are uppercased with non-alphanumerics collapsed to `_`. The server can't read VS Code's keychain, so secrets arrive as env vars.
- **`TUPLEBASE_MCP_ALLOW_WRITES`** — `1`/`true` to permit writes (still subject to each connection's `readonly`).
- **`TUPLEBASE_MCP_MAX_ROWS`** — row cap per query (default 200).

### Get a client-neutral config from VS Code

Run **TupleBase: Show MCP Server Config** from the command palette. It opens a client
config that points at the bundled server, sets `TUPLEBASE_CONFIG`, and fills in each
connection's `TUPLEBASE_SECRET_*` **from the OS keychain** — so you don't handle secrets by hand:

```jsonc
{
  "mcpServers": {
    "tuplebase": {
      "command": "node",
      "args": ["/abs/path/to/dist/mcp/server.js"],
      "env": {
        "TUPLEBASE_CONFIG": "/abs/path/to/.tuplebase.json",
        "TUPLEBASE_SECRET_APP_DB_PASSWORD": "…"
      }
    }
  }
}
```

> The generated config contains your stored secrets in plaintext — treat it like any
> other credentials file. Connections whose secret isn't in the keychain yet are listed;
> connect them once in TupleBase, then regenerate.

## Verifying it's running

- **Startup** — the server logs to **stderr** (stdout is the protocol): `[tuplebase-mcp] ready — N connection(s) (read-only)`. Config problems are logged as `[tuplebase-mcp] config: …`.
- **Smoke test the tools** — from your MCP client:
  1. `list_connections` → your connections appear, each with `readonly: true` (default).
  2. `inspect_schema { connection: "app-db" }` → top-level schema nodes.
  3. `run_query { connection: "app-db", statement: "select 1 as one" }` → `{ "one": 1 }`.
  4. `run_query` with a write (e.g. `delete …`) → **blocked** with `read-only for agents`. That confirms the guardrail.

This repository's MCP test surface has two levels:

```bash
npm test
# McpService behavior, lifecycle, secrets and read-only guardrails

TUPLEBASE_IT=1 npx vitest run tests/integration/adapters/postgres/adapter.it.test.ts
# Real adapter connection/query/schema behavior; requires the local Postgres container
```

The second command verifies the same adapter used by MCP. The agent prompts above are
the final protocol-level check that the client discovered and invoked the tools.

## Current agent-facing gaps

These do not block listing connections, inspecting schemas or answering questions with
read-only queries, but they explain the roadmap item for improved MCP support:

- Schema discovery exposes the adapter tree directly. Agents must make repeated
  `inspect_schema` calls; there is no schema search or one-call `describe_table` tool.
- Tool results are JSON encoded in MCP text content rather than returned as structured
  content with an output schema.
- `run_query` applies a row cap but does not expose the adapter continuation token, so
  agents cannot page through a large result.
- Connection opening is implicit. There are no `test_connection`, status, reconnect or
  disconnect tools, and nested connection failures can lose useful diagnostic detail.
- The MCP process cannot read VS Code SecretStorage or reuse the extension's live
  sessions. Generated client configuration currently carries the required secrets.
- The server provides tools only; it does not yet provide MCP resources, prompts or
  server instructions that teach an agent the most efficient schema-to-query workflow.

## Allowing writes

Agents are read-only by default. To let an agent write, start the server with
`TUPLEBASE_MCP_ALLOW_WRITES=1` **and** make sure the target connection isn't `readonly` in
`.tuplebase.json`. Both must hold — a `readonly` connection stays read-only even with writes
enabled.

The statement classifier is a defense-in-depth guardrail, not a replacement for database
permissions: stored procedures and read-looking functions can have server-side side effects that
client-side SQL inspection cannot prove. Use a database account with read-only grants for any
connection exposed to an untrusted agent.

## Troubleshooting

- **No connections listed** — `TUPLEBASE_CONFIG` is wrong or the file failed to parse. Check the `[tuplebase-mcp] config:` stderr lines.
- **"Missing secret … set TUPLEBASE_SECRET_…"** — that connection's secret isn't in the env. Regenerate the config from VS Code after connecting the connection once (so the secret is in the keychain), or set the env var yourself.
- **Writes rejected** — expected unless `TUPLEBASE_MCP_ALLOW_WRITES=1` and the connection is not `readonly`.
- **A connection can't connect** — the standalone server uses the same drivers/tunnels as the extension; a config or network issue there affects it too. `list_connections` still works even if one connection can't connect.
