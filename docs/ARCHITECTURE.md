# Architecture

How TupleBase is put together, and the seams you touch to **add a database type** or
work on **connections**. Read this before changing adapters, the connection form,
config parsing or the MCP server.

Related docs: [`DATABASES.md`](DATABASES.md) (support matrix + add-adapter checklist) · [`MCP.md`](MCP.md) (agent access) · [`TESTING.md`](TESTING.md) (test layers).

---

## The big picture

```
.tuplebase.json  ──parse──▶  ConfigStore ──▶ ConnectionManager ──▶ Adapter ──▶ database
   (config)                    │                  │                (driver)
                               │                  ├─ SecretVault (OS keychain)
                               ▼                  └─ SSH tunnel (ssh2)
                        adapter registry
              (eager presentations + lazy chunks)
                               │
        ┌──────────────┬───────┴────────┬─────────────────┐
   schema tree    connection form   completion        MCP server
   (explorer)     (webview)         (per language)   (standalone)
```

Everything database-specific lives behind **one adapter registry**. The rest of the
extension (tree, form, run flow, completion, MCP) is generic and reads from it.

- `.tuplebase.json` — the user's config: version, groups, connections. Secret-free and committable. Parsed by `src/core/config.ts`.
- **ConfigStore** (`src/core/configStore.ts`) — loads/watches the file, exposes connections/groups, publishes changes.
- **ConnectionManager** (`src/core/connections.ts`) — resolves secrets, opens SSH tunnels, creates + caches live adapters.
- **Adapter** (`src/adapters/<db>/adapter.ts`) — talks to one database: connect, execute, browse schema, search for completion.

---

## The adapter registry (the one seam)

Each database type is a self-contained folder under `src/adapters/<id>/`, collected in
**`src/adapters/registry.ts`** — the single place a new database is registered.

```
src/adapters/<id>/
  presentation.ts   ← EAGER data: label, icon, languageId, statementSyntax,
                       completion triggers, form fields. No driver import.
  adapter.ts        ← Adapter class + AdapterFactory (validate/requiredSecrets/create).
                       Imports its driver via dynamic import() inside connect/execute.
  completion.ts     ← CompletionContribution (optional): editor autocomplete.
  index.ts          ← the lazily-loaded CHUNK: re-exports { factory, completion }.
  <id>.svg          ← tree icon (+ <id>-connected.svg for the green-dot connected state).
```

### Eager vs lazy — why it scales to hundreds of adapters

- **Presentations are eager.** The registry statically imports every `presentation.ts` (pure data ≈ 500 bytes each). This is the "manifest" the extension reads at activation to render the tree, the New-Connection picker, the form, and to route queries — **without loading any driver code.**
- **Factories and completion are lazy.** `presentation.ts` never imports the driver. The real code lives in `adapter.ts` / `completion.ts`, bundled by esbuild into a separate chunk at `dist/adapters/<id>/index.js`. `registry.ts` loads that chunk **by path** (`__dirname`-anchored) only when a connection to that adapter is first opened.
- **Result:** the core `extension.js` bundle carries no `pg` / `@redis/client` / `@aws-sdk`. Adding the 50th adapter does not slow activation — its chunk only loads if you connect to it.

The types (`src/adapters/types.ts`):

```ts
interface AdapterModule {
  presentation: AdapterPresentation          // eager
  loadFactory(): Promise<AdapterFactory>      // lazy → import the chunk
  loadCompletion?(): Promise<CompletionContribution>
}
```

`ConnectionManager` calls `loadFactory()` (cached per adapter) at connect time;
the completion registrar calls `loadCompletion()` on first completion in a file.

---

## Adding a database type

1. **Create `src/adapters/<id>/`** with the four files above.
   - `presentation.ts` — model on `postgres/presentation.ts`. Set `id`, `label`, `emoji`, `blurb`, `codicon`, `iconFile`, `languageId` (`'sql'` / `'redis'` / a new grammar), `statementSyntax` (`'sql'` / `'partiql'` / `'redis'`), `completionTriggers`, `passwordSecret` (if it takes a password), and `fields` (the connection-form fields — these also generate the JSON schema).
   - `adapter.ts` — implement `Adapter` (`connect`, `testConnection`, `execute`, `getChildren`, `searchItems`, `dispose`) and export an `AdapterFactory` (`id`, `validate`, `requiredSecrets`, `create`). Load the driver with `await import('driver')` **inside** a method, never at module top level, so it stays out of the chunk's load cost until used.
   - `completion.ts` (optional) — export a `CompletionContribution` with `provide(ctx)` returning `CompletionResult[]`. `ctx` gives you the text, cursor, `connected` flag and a `search(kind, prefix)` bound to the live adapter.
   - `index.ts` — `export { <id>Factory as factory } from './adapter'` and `export { <id>Completion as completion } from './completion'`.
   - `<id>.svg` + `<id>-connected.svg` — 16×16 marks.
2. **Register it** — import the presentation in `src/adapters/registry.ts` and add it to `PRESENTATIONS`. That's the one line.
3. **Regenerate the JSON schema** — `npm run gen:schema` rebuilds `schemas/tuplebase.schema.json` from the presentations' `fields`. Never hand-edit that file.
4. **Add the driver dependency** to `package.json`. esbuild bundles it into the adapter's chunk (mark any optional native `.node` bindings `external` in `esbuild.mjs`).
5. **Test it** — unit tests next to the code (`adapter.test.ts`, `completion.test.ts`) and a live-container integration test (`adapter.it.test.ts`, gated by `TUPLEBASE_IT=1`), plus a compose service + seed under `dev/`.
6. **Move its row** from Candidates to Shipped in `DATABASES.md`.

Nothing else changes — config validation (`KNOWN_ADAPTERS` = registry ids), the connection form, tree icons, completion registration and the connection manager all derive from the registry.

---

## Connections & config

`.tuplebase.json`:

```jsonc
{
  "version": 1,
  "groups": {
    "local": {
      "readonly": false,                                  // optional group default
      "app-db": { "adapter": "postgres", "host": "localhost", "database": "app", "user": "me" }
    }
  }
}
```

- **Groups** are folders. A query runs against the connection **bound to its file** (there is no active environment). `src/core/fileConn.ts` tracks the file→connection binding in `workspaceState`.
- **Secret-free.** Passwords never live in the file. `config.ts` rejects secret-looking fields. Per-connection extras: `readonly` (block writes), `ssh` (bastion tunnel, see below), `promptPassword` (prompt every connect instead of storing).
- **`${env:VAR}`** interpolation is applied to string values (and ssh string fields).

### Legacy filename migration

During the pre-release rename window, `ConfigStore` and the extension manifest also discover `.rowboat.json`. If both filenames exist, `.tuplebase.json` wins; if only the legacy file exists, TupleBase loads it and offers an explicit rename without silently modifying the workspace. JSON schema validation applies to both filenames. VS Code SecretStorage and workspace state are scoped to the extension id, so credentials and file bindings from development builds under the old id are intentionally not migrated.

### Secrets

`SecretVault` (`src/core/secrets.ts`) wraps VS Code SecretStorage (OS keychain), keyed by connection name + field. `ConnectionManager.getSecret` prompts once and stores; with `promptPassword: true` it prompts every connect and stores nothing. Per-connection **Reset Credentials** clears one connection's secrets; **Clear Stored Credentials** clears all.

### SSH tunnels

A host/port connection may carry an `ssh` block (`src/core/sshTunnel.ts`, `ssh2`). At connect the manager opens a local forward through the bastion and points the adapter at `127.0.0.1:<localPort>`. Key passphrase / SSH password are keychained like DB passwords. Rejected for adapters with no `host` (DynamoDB).

### Creating / editing a connection (the CRUD flow)

Users don't hand-edit the file — the UI writes it back with comments preserved:

```
webview form (src/webview/connForm.ts)  ──postMessage──▶  host panel (src/ui/connFormPanel.ts)
   data-driven: renders from the injected           re-validates (authoritative), checks name
   AdapterPresentation[] (no adapter code            uniqueness, then writes via jsonc:
   in the browser bundle)                            src/core/configWriter.ts (add/remove/rename/move)
                                                      password → SecretVault (never the file)
```

- **2-stage form**: pick a DB-type card → per-adapter fields (from `presentation.fields`) → optional credentials section (password + prompt-every-connect toggle).
- **Explorer** (`src/ui/schemaTree.ts`): group-first tree; per-adapter icons; drag a connection between groups; context menus + toolbar wired to `configWriter`.
- **configWriter** (`src/core/configWriter.ts`): all edits are jsonc `modify`/`applyEdits`, so comments and formatting survive. `addConnection` auto-creates a missing group (used by the toolbar's default "Ungrouped" bucket).

---

## Running a query

`src/core/runQuery.ts` — resolve the file's connection (prompt/pick if unbound, filtered by `presentation.languageId`), split the file into statements by the adapter's `statementSyntax` (`src/core/statements.ts` + `src/core/dialect.ts`), block writes on read-only connections (`src/core/querySafety.ts`), execute via the adapter, and post results to the grid (`src/ui/resultsPanel.ts` → `src/webview/results.ts`). A row opens the themed JSON detail view (`src/webview/detailJson.ts`).

---

## Build & bundles

`esbuild.mjs` produces several bundles (all CJS, node/browser as appropriate):

| Output | What |
|---|---|
| `dist/extension.js` | the extension host (core — no drivers) |
| `dist/webview/{results,connForm}.js` | browser bundles (no node/adapter code) |
| `dist/adapters/<id>/index.js` | per-adapter chunk (factory + completion + driver), loaded by the extension |
| `dist/mcp/server.js` + `dist/mcp/adapters/<id>/` | the standalone MCP server + its adapter chunks |
| `dist/test/*.js` | the VS Code smoke test |

`npm run build` runs `gen:schema` then esbuild. `tsconfig.json` uses **bundler** module resolution (matches esbuild; allows extensionless dynamic imports). See [`TESTING.md`](TESTING.md) for the test layers (`npm test`, `TUPLEBASE_IT=1 npx vitest run`, `npm run test:vscode`).

---

## MCP server

`src/mcp/` builds a standalone Model Context Protocol server that exposes the same
connections to AI agents (`list_connections`, `inspect_schema`, `run_query`), reusing
the adapter registry, config parser and read-only guardrail — read-only for agents by
default. Secrets arrive as env vars. See [`MCP.md`](MCP.md).
