# TupleBase Plan 01 — Walking Skeleton (Postgres end-to-end) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working VS Code extension that loads `.tuplebase.json` environments, connects to Postgres (password via SecretStorage), shows a schema tree in a TupleBase activity-bar container, and runs SQL from an editor into a Tabulator results grid in the bottom panel.

**Architecture:** Monolithic extension, in-process adapters behind an internal `Adapter` interface (spec: `~/memory/2026-07-05-tuplebase-design.md`). Drivers lazy-required. Two esbuild bundles: extension host (CJS) + results webview. Pure modules (config, statements) tested with vitest; Postgres adapter integration-tested against docker-compose.

**Tech Stack:** TypeScript, esbuild, vitest, `pg`, `jsonc-parser`, `tabulator-tables`, `@vscode/test-electron`.

## Global Constraints

- Node modules: `pg` (MIT), `jsonc-parser` (MIT), `tabulator-tables` (MIT) only. NO native modules. NO new deps beyond tasks below.
- esbuild: `platform: 'node', format: 'cjs', external: ['vscode', 'pg-native']` for the host bundle.
- Config file name: `.tuplebase.json` at workspace root. Secret fields NEVER in config or its schema.
- SecretStorage keys: `tuplebase.<env>.<conn>.<field>`. Key index in globalState under `tuplebase.secretKeys`.
- Commits: conventional format (`feat:`, `test:`, `chore:`). Never mention Claude/AI in commit messages, descriptions, or PRs. No Co-Authored-By lines.
- All webview assets bundled locally, loaded via `asWebviewUri`, CSP base `default-src 'none'`. No CDN/network in webview.
- `engines.vscode`: `^1.90.0`.

---

### Task 1: Extension scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `esbuild.mjs`, `.vscodeignore`, `.gitignore`, `.vscode/launch.json`, `src/extension.ts`, `media/tuplebase.svg`, `vitest.config.ts`

**Interfaces:**
- Produces: npm scripts `build`, `watch`, `test`, `check`. `activate(context)`/`deactivate()` in `src/extension.ts`. View container id `tuplebase`, view ids `tuplebase.explorer` (tree) and `tuplebase.results` (webview, panel). Command ids `tuplebase.runQuery`, `tuplebase.selectEnvironment`, `tuplebase.refreshExplorer`, `tuplebase.clearCredentials`.

- [ ] **Step 1: package.json**

```json
{
  "name": "tuplebase",
  "displayName": "TupleBase",
  "description": "Paddle through your rows. Query Postgres, Redis and DynamoDB from VS Code.",
  "version": "0.1.0",
  "publisher": "tuplebase",
  "license": "MIT",
  "repository": { "type": "git", "url": "https://github.com/FeliceGeracitano/tuplebase" },
  "engines": { "vscode": "^1.90.0" },
  "categories": ["Other"],
  "keywords": ["postgres", "redis", "dynamodb", "sql", "database"],
  "main": "./dist/extension.js",
  "activationEvents": ["workspaceContains:**/.tuplebase.json"],
  "contributes": {
    "viewsContainers": {
      "activitybar": [{ "id": "tuplebase", "title": "TupleBase", "icon": "media/tuplebase.svg" }],
      "panel": [{ "id": "tuplebase-panel", "title": "TupleBase Results", "icon": "media/tuplebase.svg" }]
    },
    "views": {
      "tuplebase": [{ "id": "tuplebase.explorer", "name": "Explorer", "icon": "media/tuplebase.svg" }],
      "tuplebase-panel": [{ "id": "tuplebase.results", "type": "webview", "name": "Results" }]
    },
    "viewsWelcome": [
      {
        "view": "tuplebase.explorer",
        "contents": "No .tuplebase.json found in this workspace.\n[Create Config](command:tuplebase.createConfig)"
      }
    ],
    "commands": [
      { "command": "tuplebase.runQuery", "title": "TupleBase: Run Query", "icon": "$(play)" },
      { "command": "tuplebase.selectEnvironment", "title": "TupleBase: Select Environment" },
      { "command": "tuplebase.refreshExplorer", "title": "TupleBase: Refresh Explorer", "icon": "$(refresh)" },
      { "command": "tuplebase.clearCredentials", "title": "TupleBase: Clear Stored Credentials" },
      { "command": "tuplebase.createConfig", "title": "TupleBase: Create Config File" }
    ],
    "menus": {
      "editor/title/run": [
        { "command": "tuplebase.runQuery", "when": "resourceLangId == sql", "group": "navigation" }
      ],
      "view/title": [
        { "command": "tuplebase.refreshExplorer", "when": "view == tuplebase.explorer", "group": "navigation" }
      ]
    },
    "keybindings": [
      { "command": "tuplebase.runQuery", "key": "ctrl+enter", "mac": "cmd+enter", "when": "editorTextFocus && resourceLangId == sql" }
    ]
  },
  "scripts": {
    "build": "node esbuild.mjs",
    "watch": "node esbuild.mjs --watch",
    "check": "tsc --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/vscode": "^1.90.0",
    "esbuild": "^0.24.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: tsconfig.json, esbuild.mjs, .gitignore, .vscodeignore, launch config**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

`esbuild.mjs`:
```js
import * as esbuild from 'esbuild'

const watch = process.argv.includes('--watch')

const host = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  platform: 'node',
  format: 'cjs',
  external: ['vscode', 'pg-native'],
  sourcemap: true,
  minify: process.env.NODE_ENV === 'production',
}

const webview = {
  entryPoints: ['src/webview/results.ts'],
  bundle: true,
  outfile: 'dist/webview/results.js',
  platform: 'browser',
  format: 'iife',
  sourcemap: true,
  minify: process.env.NODE_ENV === 'production',
}

if (watch) {
  const ctxs = await Promise.all([esbuild.context(host), esbuild.context(webview)])
  await Promise.all(ctxs.map(c => c.watch()))
} else {
  await Promise.all([esbuild.build(host), esbuild.build(webview)])
}
```

`.gitignore`:
```
node_modules/
dist/
*.vsix
```

`.vscodeignore`:
```
src/**
node_modules/**
docs/**
dev/**
.vscode/**
esbuild.mjs
vitest.config.ts
tsconfig.json
docker-compose.yml
**/*.map
```

`.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Extension",
      "type": "extensionHost",
      "request": "launch",
      "args": ["--extensionDevelopmentPath=${workspaceFolder}"],
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "preLaunchTask": "npm: build"
    }
  ]
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { include: ['src/**/*.test.ts'] } })
```

- [ ] **Step 3: minimal extension.ts + webview placeholder + icon**

`src/extension.ts`:
```ts
import * as vscode from 'vscode'

export function activate(context: vscode.ExtensionContext) {
  console.log('tuplebase activated')
}

export function deactivate() {}
```

`src/webview/results.ts`:
```ts
// populated in Task 10
export {}
```

`media/tuplebase.svg` (24x24 monochrome boat, uses currentColor per VS Code guidelines):
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
  <path d="M3 14l2 5h14l2-5z"/>
  <path d="M12 3v11"/>
  <path d="M12 4l6 8h-6z"/>
</svg>
```

- [ ] **Step 4: install, build, typecheck**

Run: `npm install && npm run build && npm run check`
Expected: `dist/extension.js` and `dist/webview/results.js` exist, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: extension scaffold with esbuild, vitest and manifest"
```

---

### Task 2: Dev databases via docker compose profiles

**Files:**
- Create: `docker-compose.yml`, `dev/seed/postgres/01-schema.sql`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces: `npm run db:postgres` starts postgres on `localhost:5432` (user `tuplebase`, password `tuplebase`, db `tuplebase`) seeded with `crew` and `voyages` tables. `npm run db:down` stops all. Profiles: `postgres`, `redis`, `dynamodb`, `all` (redis/dynamo services added in Plan 02).

- [ ] **Step 1: docker-compose.yml**

```yaml
services:
  postgres:
    image: postgres:17
    profiles: ["postgres", "all"]
    ports: ["5432:5432"]
    environment:
      POSTGRES_USER: tuplebase
      POSTGRES_PASSWORD: tuplebase
      POSTGRES_DB: tuplebase
    volumes:
      - ./dev/seed/postgres:/docker-entrypoint-initdb.d
```

- [ ] **Step 2: seed SQL**

`dev/seed/postgres/01-schema.sql`:
```sql
CREATE TABLE crew (
  id serial PRIMARY KEY,
  name text NOT NULL,
  role text NOT NULL,
  joined date NOT NULL DEFAULT current_date
);

CREATE TABLE voyages (
  id serial PRIMARY KEY,
  crew_id int REFERENCES crew(id),
  destination text NOT NULL,
  departed_at timestamptz
);

INSERT INTO crew (name, role) VALUES
  ('ada', 'captain'), ('linus', 'rower'), ('grace', 'navigator');

INSERT INTO voyages (crew_id, destination, departed_at) VALUES
  (1, 'upstream', now() - interval '2 days'),
  (2, 'downstream', now() - interval '1 day'),
  (3, 'delta', NULL);
```

- [ ] **Step 3: npm scripts** — add to `package.json` `scripts`:

```json
"db:postgres": "docker compose --profile postgres up -d",
"db:all": "docker compose --profile all up -d",
"db:down": "docker compose --profile all down"
```

- [ ] **Step 4: verify**

Run: `npm run db:postgres && sleep 3 && docker compose exec postgres psql -U tuplebase -c "select count(*) from crew;"`
Expected: `3`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: dockerized dev databases with per-db compose profiles"
```

---

### Task 3: Adapter contract types + statement splitting

**Files:**
- Create: `src/adapters/types.ts`, `src/core/statements.ts`
- Test: `src/core/statements.test.ts`

**Interfaces:**
- Produces (exact, later tasks depend on these):

```ts
// src/adapters/types.ts — no vscode import (keeps vitest usable); cancel via AbortSignal
export type AdapterId = string

export interface ConnectionConfig {
  env: string
  name: string
  adapter: AdapterId
  [key: string]: unknown
}

export interface ResolvedConnection extends ConnectionConfig {
  secrets: Record<string, string>
}

export interface ColumnMeta { name: string; type?: string }

export interface ResultEnvelope {
  columns: ColumnMeta[]
  rows: unknown[][]
  rowCount: number
  elapsedMs: number
  warnings: string[]
  nextPageToken?: string
}

export type ItemKind = 'schema' | 'table' | 'column' | 'key' | 'index'

export interface SchemaItem { kind: ItemKind; name: string; parent?: string; detail?: string }

export interface TreeNode {
  id: string
  label: string
  kind: string
  hasChildren: boolean
  detail?: string
}

export interface ExecuteOptions {
  pageSize: number
  signal: AbortSignal
  pageToken?: string
}

export interface Adapter {
  readonly id: AdapterId
  connect(cfg: ResolvedConnection): Promise<void>
  testConnection(cfg: ResolvedConnection): Promise<void>
  execute(stmt: string, opts: ExecuteOptions): Promise<ResultEnvelope>
  getChildren(node: TreeNode | null): Promise<TreeNode[]>
  searchItems(kind: ItemKind, prefix: string): Promise<SchemaItem[]>
  dispose(): Promise<void>
}

export interface AdapterFactory {
  id: AdapterId
  validate(raw: Record<string, unknown>): string[]
  requiredSecrets(cfg: ConnectionConfig): string[]
  create(cfg: ResolvedConnection): Adapter
}
```

```ts
// src/core/statements.ts
export interface StatementRange { text: string; start: number; end: number }
export function splitStatements(text: string): StatementRange[]
export function statementAt(text: string, offset: number): StatementRange | undefined
```

- [ ] **Step 1: write types.ts exactly as above** (it is the deliverable — pure types, no test).

- [ ] **Step 2: failing tests for statement splitting**

`src/core/statements.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { splitStatements, statementAt } from './statements'

describe('splitStatements', () => {
  it('splits on semicolons', () => {
    const r = splitStatements('select 1; select 2;')
    expect(r.map(s => s.text)).toEqual(['select 1', 'select 2'])
  })

  it('ignores semicolons inside single-quoted strings', () => {
    const r = splitStatements("select 'a;b'; select 2")
    expect(r.map(s => s.text)).toEqual(["select 'a;b'", 'select 2'])
  })

  it('handles escaped quotes (doubled) inside strings', () => {
    const r = splitStatements("select 'it''s;fine'; select 2")
    expect(r).toHaveLength(2)
  })

  it('ignores semicolons in line and block comments', () => {
    const r = splitStatements('select 1 -- no; split\n; select 2 /* not; here */')
    expect(r.map(s => s.text.trim())).toEqual(['select 1 -- no; split', 'select 2 /* not; here */'])
  })

  it('skips empty statements', () => {
    expect(splitStatements(';;  ;')).toEqual([])
  })

  it('reports offsets usable for statementAt', () => {
    const text = 'select 1;\nselect 2;'
    const second = statementAt(text, text.indexOf('2'))
    expect(second?.text.trim()).toBe('select 2')
  })

  it('statementAt on boundary returns the statement before the cursor', () => {
    const text = 'select 1;'
    expect(statementAt(text, 9)?.text).toBe('select 1')
  })
})
```

- [ ] **Step 3: run to verify fail**

Run: `npx vitest run src/core/statements.test.ts`
Expected: FAIL — cannot resolve `./statements`.

- [ ] **Step 4: implement**

`src/core/statements.ts`:
```ts
export interface StatementRange { text: string; start: number; end: number }

export function splitStatements(text: string): StatementRange[] {
  const out: StatementRange[] = []
  let start = 0
  let i = 0
  const push = (end: number) => {
    const raw = text.slice(start, end)
    if (raw.trim().length > 0) out.push({ text: raw.trim(), start, end })
    start = end + 1
  }
  while (i < text.length) {
    const ch = text[i]
    if (ch === "'") {
      i++
      while (i < text.length) {
        if (text[i] === "'" && text[i + 1] === "'") { i += 2; continue }
        if (text[i] === "'") break
        i++
      }
    } else if (ch === '-' && text[i + 1] === '-') {
      while (i < text.length && text[i] !== '\n') i++
      continue
    } else if (ch === '/' && text[i + 1] === '*') {
      i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++
      i++
    } else if (ch === ';') {
      push(i)
    }
    i++
  }
  push(text.length)
  return out
}

export function statementAt(text: string, offset: number): StatementRange | undefined {
  const all = splitStatements(text)
  return all.find(s => offset >= s.start && offset <= s.end + 1) ?? all[all.length - 1]
}
```

- [ ] **Step 5: run to verify pass**

Run: `npx vitest run src/core/statements.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add src/adapters/types.ts src/core/statements.ts src/core/statements.test.ts
git commit -m "feat: adapter contract types and sql statement splitting"
```

---

### Task 4: Config load, validate, interpolate

**Files:**
- Create: `src/core/config.ts`
- Test: `src/core/config.test.ts`
- Modify: `package.json` (add dependency `jsonc-parser@^3.3.1`)

**Interfaces:**
- Consumes: `ConnectionConfig` from `src/adapters/types.ts`.
- Produces:

```ts
// src/core/config.ts
export interface ConfigError { path: string; message: string }
export interface TupleBaseConfig {
  defaultEnvironment?: string
  environments: Record<string, Record<string, ConnectionConfig>>
}
export function interpolate(value: string, env: Record<string, string | undefined>): string
// throws Error('Missing environment variable: NAME') when no default given
export function parseConfig(text: string, env?: Record<string, string | undefined>):
  { config?: TupleBaseConfig; errors: ConfigError[] }
```

Known adapter ids for validation: `['postgres', 'redis', 'dynamodb']` (exported as `KNOWN_ADAPTERS`).

- [ ] **Step 1: add dep**

Run: `npm install jsonc-parser@^3.3.1`

- [ ] **Step 2: failing tests**

`src/core/config.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { interpolate, parseConfig } from './config'

describe('interpolate', () => {
  it('substitutes ${env:VAR}', () => {
    expect(interpolate('host-${env:FOO}', { FOO: 'x' })).toBe('host-x')
  })
  it('uses default with ${env:VAR:-fallback}', () => {
    expect(interpolate('${env:MISSING:-def}', {})).toBe('def')
  })
  it('throws on missing var without default', () => {
    expect(() => interpolate('${env:MISSING}', {})).toThrow(/MISSING/)
  })
  it('leaves plain strings alone', () => {
    expect(interpolate('localhost', {})).toBe('localhost')
  })
})

const VALID = `{
  // comment allowed
  "defaultEnvironment": "dev",
  "environments": {
    "dev": {
      "orders-db": { "adapter": "postgres", "host": "localhost", "port": 5432, "database": "tuplebase", "user": "tuplebase" }
    }
  }
}`

describe('parseConfig', () => {
  it('parses JSONC with comments', () => {
    const { config, errors } = parseConfig(VALID)
    expect(errors).toEqual([])
    expect(config?.environments.dev['orders-db'].adapter).toBe('postgres')
    expect(config?.environments.dev['orders-db'].env).toBe('dev')
    expect(config?.environments.dev['orders-db'].name).toBe('orders-db')
  })
  it('rejects unknown adapter', () => {
    const { errors } = parseConfig('{"environments":{"dev":{"c":{"adapter":"oracle"}}}}')
    expect(errors[0].message).toMatch(/unknown adapter/i)
    expect(errors[0].path).toBe('environments.dev.c.adapter')
  })
  it('rejects password-like fields', () => {
    const { errors } = parseConfig('{"environments":{"dev":{"c":{"adapter":"postgres","password":"x"}}}}')
    expect(errors[0].message).toMatch(/secret/i)
  })
  it('reports JSON syntax errors', () => {
    const { errors } = parseConfig('{ nope ')
    expect(errors.length).toBeGreaterThan(0)
  })
  it('interpolates env vars in string values', () => {
    const { config } = parseConfig(
      '{"environments":{"dev":{"c":{"adapter":"postgres","host":"${env:PGHOST:-localhost}"}}}}'
    )
    expect(config?.environments.dev.c.host).toBe('localhost')
  })
  it('surfaces missing env var as ConfigError, not throw', () => {
    const { errors } = parseConfig('{"environments":{"dev":{"c":{"adapter":"postgres","host":"${env:NOPE}"}}}}')
    expect(errors[0].message).toMatch(/NOPE/)
  })
})
```

- [ ] **Step 3: run to verify fail**

Run: `npx vitest run src/core/config.test.ts`
Expected: FAIL — cannot resolve `./config`.

- [ ] **Step 4: implement**

`src/core/config.ts`:
```ts
import { parse, ParseError, printParseErrorCode } from 'jsonc-parser'
import type { ConnectionConfig } from '../adapters/types'

export const KNOWN_ADAPTERS = ['postgres', 'redis', 'dynamodb']
const SECRET_FIELDS = ['password', 'passwd', 'secret', 'token', 'accesskeyid', 'secretaccesskey']

export interface ConfigError { path: string; message: string }

export interface TupleBaseConfig {
  defaultEnvironment?: string
  environments: Record<string, Record<string, ConnectionConfig>>
}

const VAR_RE = /\$\{env:([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g

export function interpolate(value: string, env: Record<string, string | undefined>): string {
  return value.replace(VAR_RE, (_m, name: string, def: string | undefined) => {
    const v = env[name]
    if (v !== undefined) return v
    if (def !== undefined) return def
    throw new Error(`Missing environment variable: ${name}`)
  })
}

export function parseConfig(
  text: string,
  env: Record<string, string | undefined> = process.env
): { config?: TupleBaseConfig; errors: ConfigError[] } {
  const parseErrors: ParseError[] = []
  const raw = parse(text, parseErrors, { allowTrailingComma: true })
  if (parseErrors.length > 0) {
    return {
      errors: parseErrors.map(e => ({ path: '', message: printParseErrorCode(e.error) })),
    }
  }
  const errors: ConfigError[] = []
  if (typeof raw !== 'object' || raw === null || typeof raw.environments !== 'object' || raw.environments === null) {
    return { errors: [{ path: 'environments', message: 'missing "environments" object' }] }
  }

  const environments: TupleBaseConfig['environments'] = {}
  for (const [envName, conns] of Object.entries(raw.environments as Record<string, unknown>)) {
    environments[envName] = {}
    if (typeof conns !== 'object' || conns === null) {
      errors.push({ path: `environments.${envName}`, message: 'must be an object of connections' })
      continue
    }
    for (const [connName, connRaw] of Object.entries(conns as Record<string, unknown>)) {
      const path = `environments.${envName}.${connName}`
      if (typeof connRaw !== 'object' || connRaw === null) {
        errors.push({ path, message: 'connection must be an object' })
        continue
      }
      const conn = { ...(connRaw as Record<string, unknown>) }
      for (const field of Object.keys(conn)) {
        if (SECRET_FIELDS.includes(field.toLowerCase())) {
          errors.push({ path: `${path}.${field}`, message: `secret field "${field}" not allowed — TupleBase keeps secrets out of config (prompted and stored on your machine)` })
        }
      }
      if (typeof conn.adapter !== 'string' || !KNOWN_ADAPTERS.includes(conn.adapter)) {
        errors.push({ path: `${path}.adapter`, message: `unknown adapter "${String(conn.adapter)}" (known: ${KNOWN_ADAPTERS.join(', ')})` })
        continue
      }
      for (const [k, v] of Object.entries(conn)) {
        if (typeof v === 'string') {
          try {
            conn[k] = interpolate(v, env)
          } catch (e) {
            errors.push({ path: `${path}.${k}`, message: (e as Error).message })
          }
        }
      }
      environments[envName][connName] = { ...conn, env: envName, name: connName, adapter: conn.adapter as string } as ConnectionConfig
    }
  }
  return {
    config: { defaultEnvironment: raw.defaultEnvironment, environments },
    errors,
  }
}
```

- [ ] **Step 5: run to verify pass**

Run: `npx vitest run src/core/config.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/core/config.ts src/core/config.test.ts
git commit -m "feat: tuplebase config parsing with env interpolation and secret rejection"
```

---

### Task 5: Config file IntelliSense (JSON schema) + ConfigStore

**Files:**
- Create: `schemas/tuplebase.schema.json`, `src/core/configStore.ts`
- Modify: `package.json` (contributes)

**Interfaces:**
- Consumes: `parseConfig`, `TupleBaseConfig`, `ConfigError` from `src/core/config.ts`.
- Produces:

```ts
// src/core/configStore.ts
export class ConfigStore implements vscode.Disposable {
  constructor(diagnostics: vscode.DiagnosticCollection)
  readonly onDidChange: vscode.Event<void>
  get config(): TupleBaseConfig | undefined
  get configUri(): vscode.Uri | undefined
  async load(): Promise<void>           // finds .tuplebase.json in first workspace folder, parses, publishes diagnostics
  environmentNames(): string[]
  connections(env: string): ConnectionConfig[]
  dispose(): void
}
```

- [ ] **Step 1: JSON schema** — `schemas/tuplebase.schema.json`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "TupleBase configuration",
  "type": "object",
  "required": ["environments"],
  "properties": {
    "defaultEnvironment": { "type": "string", "description": "Environment selected when the workspace opens" },
    "environments": {
      "type": "object",
      "description": "Named environments, each grouping named connections",
      "additionalProperties": {
        "type": "object",
        "additionalProperties": { "$ref": "#/definitions/connection" }
      }
    }
  },
  "definitions": {
    "connection": {
      "type": "object",
      "required": ["adapter"],
      "properties": {
        "adapter": { "enum": ["postgres", "redis", "dynamodb"] }
      },
      "allOf": [
        {
          "if": { "properties": { "adapter": { "const": "postgres" } } },
          "then": {
            "properties": {
              "adapter": true,
              "host": { "type": "string" },
              "port": { "type": "number", "default": 5432 },
              "database": { "type": "string" },
              "user": { "type": "string" },
              "ssl": { "type": "boolean", "default": false }
            },
            "required": ["host", "database", "user"],
            "additionalProperties": false
          }
        },
        {
          "if": { "properties": { "adapter": { "const": "redis" } } },
          "then": {
            "properties": {
              "adapter": true,
              "host": { "type": "string" },
              "port": { "type": "number", "default": 6379 },
              "db": { "type": "number", "default": 0 },
              "tls": { "type": "boolean", "default": false },
              "username": { "type": "string" }
            },
            "required": ["host"],
            "additionalProperties": false
          }
        },
        {
          "if": { "properties": { "adapter": { "const": "dynamodb" } } },
          "then": {
            "properties": {
              "adapter": true,
              "region": { "type": "string" },
              "profile": { "type": "string" },
              "endpoint": { "type": "string", "description": "Custom endpoint, e.g. http://localhost:8000 for dynamodb-local" }
            },
            "required": ["region"],
            "additionalProperties": false
          }
        }
      ]
    }
  }
}
```

Note: schema deliberately has NO password/secret properties, and `additionalProperties: false` rejects them in-editor.

- [ ] **Step 2: contributes** — add to `package.json` `contributes`:

```json
"languages": [
  { "id": "jsonc", "filenames": [".tuplebase.json"] }
],
"jsonValidation": [
  { "fileMatch": ".tuplebase.json", "url": "./schemas/tuplebase.schema.json" }
]
```

Remove `schemas/**` exclusion risk: ensure `.vscodeignore` does NOT exclude `schemas/`.

- [ ] **Step 3: ConfigStore** — `src/core/configStore.ts`:

```ts
import * as vscode from 'vscode'
import { parseConfig, TupleBaseConfig, ConfigError } from './config'
import type { ConnectionConfig } from '../adapters/types'

export class ConfigStore implements vscode.Disposable {
  private _config: TupleBaseConfig | undefined
  private _uri: vscode.Uri | undefined
  private emitter = new vscode.EventEmitter<void>()
  readonly onDidChange = this.emitter.event
  private watcher: vscode.FileSystemWatcher

  constructor(private diagnostics: vscode.DiagnosticCollection) {
    this.watcher = vscode.workspace.createFileSystemWatcher('**/.tuplebase.json')
    this.watcher.onDidChange(() => this.load())
    this.watcher.onDidCreate(() => this.load())
    this.watcher.onDidDelete(() => this.load())
  }

  get config() { return this._config }
  get configUri() { return this._uri }

  async load(): Promise<void> {
    this._config = undefined
    this._uri = undefined
    const folder = vscode.workspace.workspaceFolders?.[0]
    if (folder) {
      const uri = vscode.Uri.joinPath(folder.uri, '.tuplebase.json')
      try {
        const bytes = await vscode.workspace.fs.readFile(uri)
        this._uri = uri
        const { config, errors } = parseConfig(Buffer.from(bytes).toString('utf8'))
        this._config = config
        this.publishDiagnostics(uri, errors)
      } catch {
        // no config file — welcome view handles it
        this.diagnostics.clear()
      }
    }
    await vscode.commands.executeCommand('setContext', 'tuplebase.hasConfig', !!this._config)
    this.emitter.fire()
  }

  environmentNames(): string[] {
    return Object.keys(this._config?.environments ?? {})
  }

  connections(env: string): ConnectionConfig[] {
    return Object.values(this._config?.environments[env] ?? {})
  }

  private publishDiagnostics(uri: vscode.Uri, errors: ConfigError[]) {
    this.diagnostics.set(
      uri,
      errors.map(e => new vscode.Diagnostic(
        new vscode.Range(0, 0, 0, 1),
        e.path ? `${e.path}: ${e.message}` : e.message,
        vscode.DiagnosticSeverity.Error
      ))
    )
  }

  dispose() {
    this.watcher.dispose()
    this.emitter.dispose()
  }
}
```

- [ ] **Step 4: build + typecheck**

Run: `npm run build && npm run check`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: config json schema, jsonc association and watching config store"
```

---

### Task 6: SecretVault

**Files:**
- Create: `src/core/secrets.ts`
- Test: `src/core/secrets.test.ts`

**Interfaces:**
- Produces:

```ts
// src/core/secrets.ts — constructor takes narrow interfaces so vitest can fake them
export interface SecretBackend {   // subset of vscode.SecretStorage
  get(key: string): Thenable<string | undefined>
  store(key: string, value: string): Thenable<void>
  delete(key: string): Thenable<void>
}
export interface KeyIndex {        // subset of vscode.Memento
  get<T>(key: string, defaultValue: T): T
  update(key: string, value: unknown): Thenable<void>
}
export class SecretVault {
  constructor(backend: SecretBackend, state: KeyIndex)
  static key(env: string, conn: string, field: string): string  // `tuplebase.${env}.${conn}.${field}`
  get(env: string, conn: string, field: string): Promise<string | undefined>
  store(env: string, conn: string, field: string, value: string): Promise<void>
  deleteConnection(env: string, conn: string): Promise<void>
  clearAll(): Promise<string[]>    // returns deleted keys
}
```

- [ ] **Step 1: failing tests**

`src/core/secrets.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { SecretVault, SecretBackend, KeyIndex } from './secrets'

function fakes() {
  const secrets = new Map<string, string>()
  const state = new Map<string, unknown>()
  const backend: SecretBackend = {
    get: async k => secrets.get(k),
    store: async (k, v) => void secrets.set(k, v),
    delete: async k => void secrets.delete(k),
  }
  const index: KeyIndex = {
    get: <T,>(k: string, d: T) => (state.has(k) ? (state.get(k) as T) : d),
    update: async (k, v) => void state.set(k, v),
  }
  return { backend, index, secrets }
}

describe('SecretVault', () => {
  it('builds namespaced keys', () => {
    expect(SecretVault.key('dev', 'orders-db', 'password')).toBe('tuplebase.dev.orders-db.password')
  })

  it('stores, retrieves and indexes', async () => {
    const { backend, index } = fakes()
    const v = new SecretVault(backend, index)
    await v.store('dev', 'db', 'password', 'hunter2')
    expect(await v.get('dev', 'db', 'password')).toBe('hunter2')
  })

  it('deleteConnection removes all fields of that connection only', async () => {
    const { backend, index, secrets } = fakes()
    const v = new SecretVault(backend, index)
    await v.store('dev', 'db', 'password', 'a')
    await v.store('prod', 'db', 'password', 'b')
    await v.deleteConnection('dev', 'db')
    expect(secrets.has('tuplebase.dev.db.password')).toBe(false)
    expect(secrets.has('tuplebase.prod.db.password')).toBe(true)
  })

  it('clearAll deletes every indexed key and returns them', async () => {
    const { backend, index, secrets } = fakes()
    const v = new SecretVault(backend, index)
    await v.store('dev', 'db', 'password', 'a')
    await v.store('prod', 'db', 'password', 'b')
    const deleted = await v.clearAll()
    expect(deleted.sort()).toEqual(['tuplebase.dev.db.password', 'tuplebase.prod.db.password'])
    expect(secrets.size).toBe(0)
  })
})
```

- [ ] **Step 2: run to verify fail**

Run: `npx vitest run src/core/secrets.test.ts`
Expected: FAIL — cannot resolve `./secrets`.

- [ ] **Step 3: implement**

`src/core/secrets.ts`:
```ts
export interface SecretBackend {
  get(key: string): Thenable<string | undefined>
  store(key: string, value: string): Thenable<void>
  delete(key: string): Thenable<void>
}

export interface KeyIndex {
  get<T>(key: string, defaultValue: T): T
  update(key: string, value: unknown): Thenable<void>
}

const INDEX_KEY = 'tuplebase.secretKeys'

export class SecretVault {
  constructor(private backend: SecretBackend, private state: KeyIndex) {}

  static key(env: string, conn: string, field: string): string {
    return `tuplebase.${env}.${conn}.${field}`
  }

  private index(): string[] {
    return this.state.get<string[]>(INDEX_KEY, [])
  }

  async get(env: string, conn: string, field: string) {
    return this.backend.get(SecretVault.key(env, conn, field))
  }

  async store(env: string, conn: string, field: string, value: string) {
    const key = SecretVault.key(env, conn, field)
    await this.backend.store(key, value)
    const idx = this.index()
    if (!idx.includes(key)) await this.state.update(INDEX_KEY, [...idx, key])
  }

  async deleteConnection(env: string, conn: string) {
    const prefix = `tuplebase.${env}.${conn}.`
    const idx = this.index()
    const doomed = idx.filter(k => k.startsWith(prefix))
    for (const k of doomed) await this.backend.delete(k)
    await this.state.update(INDEX_KEY, idx.filter(k => !k.startsWith(prefix)))
  }

  async clearAll(): Promise<string[]> {
    const idx = this.index()
    for (const k of idx) await this.backend.delete(k)
    await this.state.update(INDEX_KEY, [])
    return idx
  }
}
```

- [ ] **Step 4: run to verify pass**

Run: `npx vitest run src/core/secrets.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/secrets.ts src/core/secrets.test.ts
git commit -m "feat: secret vault over vscode secretstorage with key index"
```

---

### Task 7: Postgres adapter

**Files:**
- Create: `src/adapters/postgres.ts`
- Test: `src/adapters/postgres.it.test.ts` (integration — runs only when `TUPLEBASE_IT=1`)
- Modify: `package.json` (add dependency `pg@^8.22.0`, devDependency `@types/pg@^8.11.0`)

**Interfaces:**
- Consumes: everything from `src/adapters/types.ts` (Task 3).
- Produces: `export const postgresFactory: AdapterFactory` with `id: 'postgres'`, `requiredSecrets()` returning `['password']`, `validate()` checking `host`/`database`/`user` strings present. Tree node kinds: `'schema' | 'table' | 'column'`; node ids `pg:<schema>`, `pg:<schema>.<table>`, `pg:<schema>.<table>.<column>`.

- [ ] **Step 1: add deps**

Run: `npm install pg@^8.22.0 && npm install -D @types/pg@^8.11.0`

- [ ] **Step 2: failing integration test**

`src/adapters/postgres.it.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { postgresFactory } from './postgres'
import type { ResolvedConnection } from './types'

const cfg: ResolvedConnection = {
  env: 'test', name: 'it', adapter: 'postgres',
  host: 'localhost', port: 5432, database: 'tuplebase', user: 'tuplebase',
  secrets: { password: 'tuplebase' },
}

describe.skipIf(!process.env.TUPLEBASE_IT)('postgres adapter (needs `npm run db:postgres`)', () => {
  it('validates config', () => {
    expect(postgresFactory.validate({ adapter: 'postgres' })).toContain('host is required')
    expect(postgresFactory.validate({ adapter: 'postgres', host: 'x', database: 'y', user: 'z' })).toEqual([])
  })

  it('requires a password secret', () => {
    expect(postgresFactory.requiredSecrets(cfg)).toEqual(['password'])
  })

  it('connects and runs a query', async () => {
    const a = postgresFactory.create(cfg)
    await a.connect(cfg)
    const r = await a.execute('select name, role from crew order by id', {
      pageSize: 500, signal: new AbortController().signal,
    })
    expect(r.columns.map(c => c.name)).toEqual(['name', 'role'])
    expect(r.rows[0]).toEqual(['ada', 'captain'])
    expect(r.rowCount).toBe(3)
    expect(r.elapsedMs).toBeGreaterThanOrEqual(0)
    await a.dispose()
  })

  it('caps rows at pageSize with a warning', async () => {
    const a = postgresFactory.create(cfg)
    await a.connect(cfg)
    const r = await a.execute('select generate_series(1, 1000)', {
      pageSize: 100, signal: new AbortController().signal,
    })
    expect(r.rows).toHaveLength(100)
    expect(r.warnings[0]).toMatch(/first 100/)
    await a.dispose()
  })

  it('lists schema tree children', async () => {
    const a = postgresFactory.create(cfg)
    await a.connect(cfg)
    const schemas = await a.getChildren(null)
    const pub = schemas.find(s => s.label === 'public')!
    expect(pub.kind).toBe('schema')
    const tables = await a.getChildren(pub)
    expect(tables.map(t => t.label).sort()).toEqual(['crew', 'voyages'])
    const cols = await a.getChildren(tables.find(t => t.label === 'crew')!)
    expect(cols.map(c => c.label)).toContain('name')
    expect(cols[0].hasChildren).toBe(false)
    await a.dispose()
  })

  it('searchItems finds tables by prefix', async () => {
    const a = postgresFactory.create(cfg)
    await a.connect(cfg)
    const items = await a.searchItems('table', 'cr')
    expect(items.map(i => i.name)).toContain('crew')
    await a.dispose()
  })

  it('surfaces sql errors with the pg message', async () => {
    const a = postgresFactory.create(cfg)
    await a.connect(cfg)
    await expect(
      a.execute('select * from nope', { pageSize: 10, signal: new AbortController().signal })
    ).rejects.toThrow(/relation "nope" does not exist/)
    await a.dispose()
  })
})
```

- [ ] **Step 3: run to verify fail**

Run: `npm run db:postgres && TUPLEBASE_IT=1 npx vitest run src/adapters/postgres.it.test.ts`
Expected: FAIL — cannot resolve `./postgres`.

- [ ] **Step 4: implement**

`src/adapters/postgres.ts`:
```ts
import type {
  Adapter, AdapterFactory, ConnectionConfig, ExecuteOptions,
  ItemKind, ResolvedConnection, ResultEnvelope, SchemaItem, TreeNode,
} from './types'
import type { Pool } from 'pg'

class PostgresAdapter implements Adapter {
  readonly id = 'postgres'
  private pool: Pool | undefined

  constructor(private cfg: ResolvedConnection) {}

  private async getPool(): Promise<Pool> {
    if (!this.pool) {
      const { Pool } = await import('pg')   // lazy: driver loads on first connect
      this.pool = new Pool({
        host: String(this.cfg.host),
        port: Number(this.cfg.port ?? 5432),
        database: String(this.cfg.database),
        user: String(this.cfg.user),
        password: this.cfg.secrets.password,
        ssl: this.cfg.ssl === true ? { rejectUnauthorized: false } : undefined,
        max: 3,
        connectionTimeoutMillis: 8000,
      })
    }
    return this.pool
  }

  async connect(cfg: ResolvedConnection) {
    this.cfg = cfg
    await this.testConnection(cfg)
  }

  async testConnection(_cfg: ResolvedConnection) {
    const pool = await this.getPool()
    const client = await pool.connect()
    client.release()
  }

  async execute(stmt: string, opts: ExecuteOptions): Promise<ResultEnvelope> {
    const pool = await this.getPool()
    const client = await pool.connect()
    const started = Date.now()
    const onAbort = () => {
      // pg cancellation: open a second connection and cancel the backend pid
      void (async () => {
        const pid = (client as unknown as { processID?: number }).processID
        if (pid) await pool.query('select pg_cancel_backend($1)', [pid]).catch(() => {})
      })()
    }
    opts.signal.addEventListener('abort', onAbort, { once: true })
    try {
      const res = await client.query({ text: stmt, rowMode: 'array' })
      const warnings: string[] = []
      let rows = (res.rows ?? []) as unknown[][]
      if (rows.length > opts.pageSize) {
        warnings.push(`showing first ${opts.pageSize} of ${rows.length} rows`)
        rows = rows.slice(0, opts.pageSize)
      }
      return {
        columns: (res.fields ?? []).map(f => ({ name: f.name, type: String(f.dataTypeID) })),
        rows,
        rowCount: res.rowCount ?? rows.length,
        elapsedMs: Date.now() - started,
        warnings,
      }
    } finally {
      opts.signal.removeEventListener('abort', onAbort)
      client.release()
    }
  }

  async getChildren(node: TreeNode | null): Promise<TreeNode[]> {
    const pool = await this.getPool()
    if (node === null) {
      const r = await pool.query(
        `select schema_name from information_schema.schemata
         where schema_name not in ('pg_catalog','information_schema') order by 1`
      )
      return r.rows.map(row => ({
        id: `pg:${row.schema_name}`, label: row.schema_name, kind: 'schema', hasChildren: true,
      }))
    }
    if (node.kind === 'schema') {
      const schema = node.id.slice(3)
      const r = await pool.query(
        'select table_name from information_schema.tables where table_schema = $1 order by 1', [schema]
      )
      return r.rows.map(row => ({
        id: `${node.id}.${row.table_name}`, label: row.table_name, kind: 'table', hasChildren: true,
      }))
    }
    if (node.kind === 'table') {
      const [schema, table] = node.id.slice(3).split('.')
      const r = await pool.query(
        `select column_name, data_type from information_schema.columns
         where table_schema = $1 and table_name = $2 order by ordinal_position`, [schema, table]
      )
      return r.rows.map(row => ({
        id: `${node.id}.${row.column_name}`, label: row.column_name,
        kind: 'column', hasChildren: false, detail: row.data_type,
      }))
    }
    return []
  }

  async searchItems(kind: ItemKind, prefix: string): Promise<SchemaItem[]> {
    const pool = await this.getPool()
    if (kind === 'table') {
      const r = await pool.query(
        `select table_schema, table_name from information_schema.tables
         where table_schema not in ('pg_catalog','information_schema') and table_name ilike $1 || '%'
         order by 2 limit 50`, [prefix]
      )
      return r.rows.map(row => ({ kind: 'table', name: row.table_name, parent: row.table_schema }))
    }
    if (kind === 'column') {
      const r = await pool.query(
        `select table_name, column_name, data_type from information_schema.columns
         where table_schema not in ('pg_catalog','information_schema') and column_name ilike $1 || '%'
         order by 2 limit 100`, [prefix]
      )
      return r.rows.map(row => ({ kind: 'column', name: row.column_name, parent: row.table_name, detail: row.data_type }))
    }
    return []
  }

  async dispose() {
    await this.pool?.end()
    this.pool = undefined
  }
}

export const postgresFactory: AdapterFactory = {
  id: 'postgres',
  validate(raw) {
    const errs: string[] = []
    for (const f of ['host', 'database', 'user']) {
      if (typeof raw[f] !== 'string' || raw[f] === '') errs.push(`${f} is required`)
    }
    return errs
  },
  requiredSecrets() {
    return ['password']
  },
  create(cfg) {
    return new PostgresAdapter(cfg)
  },
}
```

- [ ] **Step 5: run to verify pass**

Run: `TUPLEBASE_IT=1 npx vitest run src/adapters/postgres.it.test.ts`
Expected: PASS (7 tests). Also run `npx vitest run` — non-IT runs skip this file (describe.skipIf).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: postgres adapter with pooling, paging, cancellation and introspection"
```

---

### Task 8: Connection manager + environment status bar

**Files:**
- Create: `src/core/connections.ts`, `src/ui/statusBar.ts`
- Modify: `src/extension.ts`

**Interfaces:**
- Consumes: `ConfigStore` (Task 5), `SecretVault` (Task 6), `postgresFactory` + types (Tasks 3, 7).
- Produces:

```ts
// src/core/connections.ts
export class ConnectionManager implements vscode.Disposable {
  constructor(configStore: ConfigStore, vault: SecretVault, workspaceState: vscode.Memento)
  readonly factories: Map<string, AdapterFactory>          // 'postgres' registered; more in Plan 02
  readonly onDidChangeEnvironment: vscode.Event<string>
  get activeEnvironment(): string | undefined              // workspaceState 'tuplebase.activeEnv', falls back to defaultEnvironment, then first env
  async setActiveEnvironment(env: string): Promise<void>   // disposes all live adapters, fires event
  async getAdapter(connName: string): Promise<Adapter>     // resolves config+secrets (prompts via showInputBox if missing), creates+connects, caches per env/conn
  async reconnectWithFreshSecret(connName: string): Promise<Adapter>  // deletes stored secret, re-prompts, reconnects
  async disposeAll(): Promise<void>
  dispose(): void
}
```

Prompting: for each `factory.requiredSecrets(cfg)` field missing from vault → `vscode.window.showInputBox({ password: true, ignoreFocusOut: true, prompt: `Password for ${env}/${conn}` })`; cancelled input throws `new Error('Connection cancelled')`; entered value stored in vault, then used.

```ts
// src/ui/statusBar.ts
export function createEnvStatusBar(manager: ConnectionManager, store: ConfigStore): vscode.Disposable
// shows `$(tuplebase-ish icon or plain) TupleBase: <env>`, click → tuplebase.selectEnvironment QuickPick
```

- [ ] **Step 1: implement ConnectionManager**

`src/core/connections.ts`:
```ts
import * as vscode from 'vscode'
import type { Adapter, AdapterFactory, ConnectionConfig, ResolvedConnection } from '../adapters/types'
import { postgresFactory } from '../adapters/postgres'
import { ConfigStore } from './configStore'
import { SecretVault } from './secrets'

const ACTIVE_ENV_KEY = 'tuplebase.activeEnv'

export class ConnectionManager implements vscode.Disposable {
  readonly factories = new Map<string, AdapterFactory>([[postgresFactory.id, postgresFactory]])
  private live = new Map<string, Adapter>()   // key: `${env}/${conn}`
  private envEmitter = new vscode.EventEmitter<string>()
  readonly onDidChangeEnvironment = this.envEmitter.event

  constructor(
    private store: ConfigStore,
    private vault: SecretVault,
    private workspaceState: vscode.Memento,
  ) {}

  get activeEnvironment(): string | undefined {
    const saved = this.workspaceState.get<string>(ACTIVE_ENV_KEY)
    const names = this.store.environmentNames()
    if (saved && names.includes(saved)) return saved
    return this.store.config?.defaultEnvironment ?? names[0]
  }

  async setActiveEnvironment(env: string) {
    await this.disposeAll()
    await this.workspaceState.update(ACTIVE_ENV_KEY, env)
    this.envEmitter.fire(env)
  }

  private findConfig(connName: string): ConnectionConfig {
    const env = this.activeEnvironment
    if (!env) throw new Error('No TupleBase environment configured (.tuplebase.json)')
    const cfg = this.store.connections(env).find(c => c.name === connName)
    if (!cfg) throw new Error(`Connection "${connName}" not found in environment "${env}"`)
    return cfg
  }

  private async resolve(cfg: ConnectionConfig): Promise<ResolvedConnection> {
    const factory = this.factories.get(cfg.adapter)
    if (!factory) throw new Error(`No adapter registered for "${cfg.adapter}"`)
    const errs = factory.validate(cfg)
    if (errs.length) throw new Error(`Invalid config for ${cfg.env}/${cfg.name}: ${errs.join(', ')}`)
    const secrets: Record<string, string> = {}
    for (const field of factory.requiredSecrets(cfg)) {
      let value = await this.vault.get(cfg.env, cfg.name, field)
      if (value === undefined) {
        value = await vscode.window.showInputBox({
          password: true,
          ignoreFocusOut: true,
          prompt: `${field} for ${cfg.env}/${cfg.name}`,
        })
        if (value === undefined) throw new Error('Connection cancelled')
        await this.vault.store(cfg.env, cfg.name, field, value)
      }
      secrets[field] = value
    }
    return { ...cfg, secrets }
  }

  async getAdapter(connName: string): Promise<Adapter> {
    const cfg = this.findConfig(connName)
    const key = `${cfg.env}/${cfg.name}`
    const existing = this.live.get(key)
    if (existing) return existing
    const factory = this.factories.get(cfg.adapter)!
    const resolved = await this.resolve(cfg)
    const adapter = factory.create(resolved)
    await adapter.connect(resolved)
    this.live.set(key, adapter)
    return adapter
  }

  async reconnectWithFreshSecret(connName: string): Promise<Adapter> {
    const cfg = this.findConfig(connName)
    const key = `${cfg.env}/${cfg.name}`
    await this.live.get(key)?.dispose()
    this.live.delete(key)
    await this.vault.deleteConnection(cfg.env, cfg.name)
    return this.getAdapter(connName)
  }

  async disposeAll() {
    for (const a of this.live.values()) await a.dispose().catch(() => {})
    this.live.clear()
  }

  dispose() {
    void this.disposeAll()
    this.envEmitter.dispose()
  }
}
```

- [ ] **Step 2: status bar** — `src/ui/statusBar.ts`:

```ts
import * as vscode from 'vscode'
import { ConnectionManager } from '../core/connections'
import { ConfigStore } from '../core/configStore'

export function createEnvStatusBar(manager: ConnectionManager, store: ConfigStore): vscode.Disposable {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
  item.command = 'tuplebase.selectEnvironment'
  const render = () => {
    const env = manager.activeEnvironment
    if (env) {
      item.text = `$(database) TupleBase: ${env}`
      item.tooltip = 'Select TupleBase environment'
      item.show()
    } else {
      item.hide()
    }
  }
  const subs = [
    item,
    manager.onDidChangeEnvironment(render),
    store.onDidChange(render),
    vscode.commands.registerCommand('tuplebase.selectEnvironment', async () => {
      const names = store.environmentNames()
      if (!names.length) {
        void vscode.window.showWarningMessage('No environments in .tuplebase.json')
        return
      }
      const picked = await vscode.window.showQuickPick(names, { placeHolder: 'TupleBase environment' })
      if (picked) await manager.setActiveEnvironment(picked)
    }),
  ]
  render()
  return vscode.Disposable.from(...subs)
}
```

- [ ] **Step 3: wire into extension.ts**

`src/extension.ts` becomes:
```ts
import * as vscode from 'vscode'
import { ConfigStore } from './core/configStore'
import { SecretVault } from './core/secrets'
import { ConnectionManager } from './core/connections'
import { createEnvStatusBar } from './ui/statusBar'

export async function activate(context: vscode.ExtensionContext) {
  const diagnostics = vscode.languages.createDiagnosticCollection('tuplebase')
  const store = new ConfigStore(diagnostics)
  const vault = new SecretVault(context.secrets, context.globalState)
  const manager = new ConnectionManager(store, vault, context.workspaceState)

  context.subscriptions.push(
    diagnostics,
    store,
    manager,
    createEnvStatusBar(manager, store),
    vscode.commands.registerCommand('tuplebase.clearCredentials', async () => {
      const deleted = await vault.clearAll()
      void vscode.window.showInformationMessage(`TupleBase: cleared ${deleted.length} stored secret(s)`)
    }),
    vscode.commands.registerCommand('tuplebase.createConfig', async () => {
      const folder = vscode.workspace.workspaceFolders?.[0]
      if (!folder) return
      const uri = vscode.Uri.joinPath(folder.uri, '.tuplebase.json')
      const template = `{
  // TupleBase config — safe to commit: secrets are never stored here.
  "defaultEnvironment": "dev",
  "environments": {
    "dev": {
      "local-pg": { "adapter": "postgres", "host": "localhost", "port": 5432, "database": "tuplebase", "user": "tuplebase" }
    }
  }
}
`
      await vscode.workspace.fs.writeFile(uri, Buffer.from(template, 'utf8'))
      await vscode.window.showTextDocument(uri)
    }),
  )

  await store.load()
}

export function deactivate() {}
```

- [ ] **Step 4: build + typecheck + manual smoke**

Run: `npm run build && npm run check`
Then F5 → in Extension Development Host open the tuplebase repo itself → status bar shows `TupleBase: dev` after Task 12's config exists (for now, use `TupleBase: Create Config File` from the welcome view; status bar appears).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: connection manager with secret prompting and environment status bar"
```

---

### Task 9: Schema explorer tree

**Files:**
- Create: `src/ui/schemaTree.ts`
- Modify: `src/extension.ts`, `package.json` (context menu)

**Interfaces:**
- Consumes: `ConnectionManager` (Task 8), `ConfigStore` (Task 5), `TreeNode` (Task 3).
- Produces: `class SchemaTreeProvider implements vscode.TreeDataProvider<ExplorerNode>`; `registerSchemaTree(manager, store): vscode.Disposable`. `ExplorerNode = { type: 'connection', conn: ConnectionConfig } | { type: 'dbnode', connName: string, node: TreeNode }`. Tree levels: connection (root, per active env) → adapter.getChildren chain. Connection nodes have `contextValue: 'tuplebase.connection'`; command `tuplebase.disconnect` on them.

- [ ] **Step 1: implement**

`src/ui/schemaTree.ts`:
```ts
import * as vscode from 'vscode'
import type { ConnectionConfig, TreeNode } from '../adapters/types'
import { ConnectionManager } from '../core/connections'
import { ConfigStore } from '../core/configStore'

export type ExplorerNode =
  | { type: 'connection'; conn: ConnectionConfig }
  | { type: 'dbnode'; connName: string; node: TreeNode }

const KIND_ICONS: Record<string, string> = {
  schema: 'symbol-namespace',
  table: 'table',
  column: 'symbol-field',
}

export class SchemaTreeProvider implements vscode.TreeDataProvider<ExplorerNode> {
  private emitter = new vscode.EventEmitter<ExplorerNode | undefined>()
  readonly onDidChangeTreeData = this.emitter.event

  constructor(private manager: ConnectionManager, private store: ConfigStore) {}

  refresh() {
    this.emitter.fire(undefined)
  }

  getTreeItem(el: ExplorerNode): vscode.TreeItem {
    if (el.type === 'connection') {
      const item = new vscode.TreeItem(el.conn.name, vscode.TreeItemCollapsibleState.Collapsed)
      item.description = el.conn.adapter
      item.iconPath = new vscode.ThemeIcon('plug')
      item.contextValue = 'tuplebase.connection'
      return item
    }
    const item = new vscode.TreeItem(
      el.node.label,
      el.node.hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
    )
    item.description = el.node.detail
    item.iconPath = new vscode.ThemeIcon(KIND_ICONS[el.node.kind] ?? 'circle-outline')
    item.contextValue = `tuplebase.${el.node.kind}`
    return item
  }

  async getChildren(el?: ExplorerNode): Promise<ExplorerNode[]> {
    try {
      if (!el) {
        const env = this.manager.activeEnvironment
        if (!env) return []
        return this.store.connections(env).map(conn => ({ type: 'connection' as const, conn }))
      }
      if (el.type === 'connection') {
        const adapter = await this.manager.getAdapter(el.conn.name)
        const children = await adapter.getChildren(null)
        return children.map(node => ({ type: 'dbnode' as const, connName: el.conn.name, node }))
      }
      const adapter = await this.manager.getAdapter(el.connName)
      const children = await adapter.getChildren(el.node)
      return children.map(node => ({ type: 'dbnode' as const, connName: el.connName, node }))
    } catch (e) {
      void vscode.window.showErrorMessage(`TupleBase: ${(e as Error).message}`)
      return []
    }
  }
}

export function registerSchemaTree(manager: ConnectionManager, store: ConfigStore): vscode.Disposable {
  const provider = new SchemaTreeProvider(manager, store)
  const view = vscode.window.createTreeView('tuplebase.explorer', { treeDataProvider: provider })
  return vscode.Disposable.from(
    view,
    store.onDidChange(() => provider.refresh()),
    manager.onDidChangeEnvironment(() => provider.refresh()),
    vscode.commands.registerCommand('tuplebase.refreshExplorer', () => provider.refresh()),
    vscode.commands.registerCommand('tuplebase.disconnect', async (el?: ExplorerNode) => {
      if (el?.type === 'connection') {
        await manager.disposeAll()
        provider.refresh()
      }
    }),
  )
}
```

- [ ] **Step 2: manifest** — add to `contributes.commands`:

```json
{ "command": "tuplebase.disconnect", "title": "TupleBase: Disconnect" }
```

and to `contributes.menus`:

```json
"view/item/context": [
  { "command": "tuplebase.disconnect", "when": "view == tuplebase.explorer && viewItem == tuplebase.connection" }
]
```

- [ ] **Step 3: wire** — in `src/extension.ts` `activate`, after `createEnvStatusBar(...)`:

```ts
import { registerSchemaTree } from './ui/schemaTree'
// ...
context.subscriptions.push(registerSchemaTree(manager, store))
```

- [ ] **Step 4: manual verify**

Run: `npm run build && npm run check`, F5, open tuplebase repo, ensure `npm run db:postgres` is up, create config via command if absent. Expand `local-pg` → password prompt → enter `tuplebase` → `public` → `crew` → columns with types. Context-menu Disconnect works; refresh works.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: schema explorer tree over adapter introspection"
```

---

### Task 10: Results panel webview (Tabulator)

**Files:**
- Create: `src/ui/resultsPanel.ts`, `src/webview/results.ts`, `src/webview/results.css`
- Modify: `esbuild.mjs` (copy css), `package.json` (add dependency `tabulator-tables@^6.3.0`, devDependency `@types/tabulator-tables@^6.2.0`)

**Interfaces:**
- Consumes: `ResultEnvelope` (Task 3).
- Produces:

```ts
// src/ui/resultsPanel.ts
export type ResultsMessage =                     // extension → webview
  | { type: 'running'; statement: string }
  | { type: 'result'; envelope: ResultEnvelope; statement: string }
  | { type: 'error'; message: string }
export type ResultsRequest = { type: 'cancel' }  // webview → extension

export class ResultsPanel implements vscode.WebviewViewProvider {
  constructor(extensionUri: vscode.Uri)
  static register(context: vscode.ExtensionContext): ResultsPanel  // registers provider for 'tuplebase.results'
  readonly onCancel: vscode.Event<void>
  async show(): Promise<void>                     // reveals the panel view
  post(msg: ResultsMessage): void
}
```

- [ ] **Step 1: add deps**

Run: `npm install tabulator-tables@^6.3.0 && npm install -D @types/tabulator-tables@^6.2.0`

- [ ] **Step 2: esbuild css copy** — in `esbuild.mjs`, extend the webview build so Tabulator css + our css land in dist:

```js
import { cpSync, mkdirSync } from 'node:fs'

// after builds complete (non-watch) and inside a small plugin for watch:
const copyAssets = () => {
  mkdirSync('dist/webview', { recursive: true })
  cpSync('node_modules/tabulator-tables/dist/css/tabulator.min.css', 'dist/webview/tabulator.min.css')
  cpSync('src/webview/results.css', 'dist/webview/results.css')
}

const assetPlugin = { name: 'copy-assets', setup(b) { b.onEnd(copyAssets) } }
webview.plugins = [assetPlugin]
```

- [ ] **Step 3: provider** — `src/ui/resultsPanel.ts`:

```ts
import * as vscode from 'vscode'
import type { ResultEnvelope } from '../adapters/types'

export type ResultsMessage =
  | { type: 'running'; statement: string }
  | { type: 'result'; envelope: ResultEnvelope; statement: string }
  | { type: 'error'; message: string }

export type ResultsRequest = { type: 'cancel' }

export class ResultsPanel implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined
  private pending: ResultsMessage | undefined
  private cancelEmitter = new vscode.EventEmitter<void>()
  readonly onCancel = this.cancelEmitter.event

  constructor(private extensionUri: vscode.Uri) {}

  static register(context: vscode.ExtensionContext): ResultsPanel {
    const panel = new ResultsPanel(context.extensionUri)
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider('tuplebase.results', panel),
      panel.cancelEmitter,
    )
    return panel
  }

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview')],
    }
    view.webview.onDidReceiveMessage((msg: ResultsRequest) => {
      if (msg.type === 'cancel') this.cancelEmitter.fire()
    })
    view.webview.html = this.html(view.webview)
    if (this.pending) {
      void view.webview.postMessage(this.pending)
      this.pending = undefined
    }
  }

  async show() {
    await vscode.commands.executeCommand('tuplebase.results.focus')
  }

  post(msg: ResultsMessage) {
    if (this.view) void this.view.webview.postMessage(msg)
    else this.pending = msg
  }

  private html(webview: vscode.Webview): string {
    const base = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview')
    const js = webview.asWebviewUri(vscode.Uri.joinPath(base, 'results.js'))
    const gridCss = webview.asWebviewUri(vscode.Uri.joinPath(base, 'tabulator.min.css'))
    const css = webview.asWebviewUri(vscode.Uri.joinPath(base, 'results.css'))
    const csp = `default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource}; font-src ${webview.cspSource};`
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <link rel="stylesheet" href="${gridCss}">
  <link rel="stylesheet" href="${css}">
</head>
<body>
  <div id="toolbar">
    <span id="status">Run a query to see results.</span>
    <button id="cancel" hidden>Cancel</button>
  </div>
  <div id="grid"></div>
  <script src="${js}"></script>
</body>
</html>`
  }
}
```

- [ ] **Step 4: webview script + css**

`src/webview/results.ts`:
```ts
import { TabulatorFull as Tabulator } from 'tabulator-tables'

type Envelope = {
  columns: { name: string; type?: string }[]
  rows: unknown[][]
  rowCount: number
  elapsedMs: number
  warnings: string[]
}
type Incoming =
  | { type: 'running'; statement: string }
  | { type: 'result'; envelope: Envelope; statement: string }
  | { type: 'error'; message: string }

const vscode = acquireVsCodeApi<{ last?: Incoming }>()
const status = document.getElementById('status')!
const cancelBtn = document.getElementById('cancel') as HTMLButtonElement
let table: Tabulator | undefined

cancelBtn.addEventListener('click', () => vscode.postMessage({ type: 'cancel' }))

function render(msg: Incoming) {
  if (msg.type === 'running') {
    status.textContent = `Running: ${msg.statement.slice(0, 120)}…`
    cancelBtn.hidden = false
    return
  }
  cancelBtn.hidden = true
  if (msg.type === 'error') {
    status.textContent = msg.message
    table?.destroy()
    table = undefined
    return
  }
  const { envelope } = msg
  const warn = envelope.warnings.length ? ` — ${envelope.warnings.join('; ')}` : ''
  status.textContent = `${envelope.rowCount} rows in ${envelope.elapsedMs}ms${warn}`
  const columns = envelope.columns.map((c, i) => ({
    title: c.name,
    field: `c${i}`,
    formatter: (cell: { getValue(): unknown }) => {
      const v = cell.getValue()
      return v === null || v === undefined ? '<span class="null">NULL</span>' : String(v)
    },
  }))
  const data = envelope.rows.map(r => Object.fromEntries(r.map((v, i) => [`c${i}`, v])))
  table?.destroy()
  table = new Tabulator('#grid', {
    data,
    columns,
    height: '100%',
    layout: 'fitDataStretch',
  })
  vscode.setState({ last: msg })
}

window.addEventListener('message', e => render(e.data as Incoming))
const prior = vscode.getState()?.last
if (prior) render(prior)

declare function acquireVsCodeApi<T>(): {
  postMessage(msg: unknown): void
  getState(): T | undefined
  setState(s: T): void
}
```

`src/webview/results.css`:
```css
body { padding: 0; margin: 0; font-family: var(--vscode-font-family); color: var(--vscode-foreground); }
#toolbar { display: flex; gap: 8px; align-items: center; padding: 4px 8px; }
#grid { height: calc(100vh - 30px); }
.null { opacity: 0.5; font-style: italic; }
.tabulator { background: transparent; font-size: var(--vscode-font-size); }
```

- [ ] **Step 5: build + typecheck**

Run: `npm run build && npm run check`
Expected: `dist/webview/results.js`, `tabulator.min.css`, `results.css` present.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: results panel webview with tabulator grid"
```

---

### Task 11: Run Query command — end to end

**Files:**
- Create: `src/core/runQuery.ts`
- Modify: `src/extension.ts`

**Interfaces:**
- Consumes: `statementAt` (Task 3), `ConnectionManager` (Task 8), `ResultsPanel` (Task 10), `ConfigStore` (Task 5).
- Produces: command `tuplebase.runQuery` — takes active editor's selection (or statement under cursor), picks connection for the file (QuickPick over active env's connections, remembered in workspaceState under `tuplebase.fileConn.<fsPath>`), executes, posts to results panel. Auth errors offer "Re-enter password".

- [ ] **Step 1: implement**

`src/core/runQuery.ts`:
```ts
import * as vscode from 'vscode'
import { statementAt } from './statements'
import { ConnectionManager } from './connections'
import { ConfigStore } from './configStore'
import { ResultsPanel } from '../ui/resultsPanel'

const FILE_CONN_PREFIX = 'tuplebase.fileConn.'
const AUTH_ERROR_RE = /password authentication failed|SASL|28P01/i

export function registerRunQuery(
  manager: ConnectionManager,
  store: ConfigStore,
  panel: ResultsPanel,
  workspaceState: vscode.Memento,
): vscode.Disposable {
  let inFlight: AbortController | undefined

  const pickConnection = async (fsPath: string): Promise<string | undefined> => {
    const env = manager.activeEnvironment
    if (!env) {
      void vscode.window.showWarningMessage('TupleBase: no .tuplebase.json config found')
      return undefined
    }
    const key = FILE_CONN_PREFIX + fsPath
    const remembered = workspaceState.get<string>(key)
    const available = store.connections(env).map(c => c.name)
    if (remembered && available.includes(remembered)) return remembered
    const picked = await vscode.window.showQuickPick(available, {
      placeHolder: `Run against which ${env} connection?`,
    })
    if (picked) await workspaceState.update(key, picked)
    return picked
  }

  const run = async () => {
    const editor = vscode.window.activeTextEditor
    if (!editor) return
    const doc = editor.document
    const stmt = editor.selection.isEmpty
      ? statementAt(doc.getText(), doc.offsetAt(editor.selection.active))?.text
      : doc.getText(editor.selection)
    if (!stmt || !stmt.trim()) {
      void vscode.window.showWarningMessage('TupleBase: no statement at cursor')
      return
    }
    const connName = await pickConnection(doc.uri.fsPath)
    if (!connName) return

    inFlight?.abort()
    inFlight = new AbortController()
    const signal = inFlight.signal

    await panel.show()
    panel.post({ type: 'running', statement: stmt })
    try {
      const adapter = await manager.getAdapter(connName)
      const envelope = await adapter.execute(stmt, { pageSize: 500, signal })
      panel.post({ type: 'result', envelope, statement: stmt })
    } catch (e) {
      const message = (e as Error).message
      panel.post({ type: 'error', message: `Error: ${message}` })
      if (AUTH_ERROR_RE.test(message)) {
        const retry = await vscode.window.showErrorMessage(
          `TupleBase: authentication failed for ${connName}`, 'Re-enter password'
        )
        if (retry) {
          await manager.reconnectWithFreshSecret(connName)
          await run()
        }
      }
    } finally {
      inFlight = undefined
    }
  }

  return vscode.Disposable.from(
    vscode.commands.registerCommand('tuplebase.runQuery', run),
    panel.onCancel(() => inFlight?.abort()),
  )
}
```

- [ ] **Step 2: wire** — in `src/extension.ts` `activate`:

```ts
import { ResultsPanel } from './ui/resultsPanel'
import { registerRunQuery } from './core/runQuery'
// ...
const panel = ResultsPanel.register(context)
context.subscriptions.push(registerRunQuery(manager, store, panel, context.workspaceState))
```

- [ ] **Step 3: manual end-to-end verify**

`npm run build`, F5, open tuplebase repo (with `.tuplebase.json` + compose postgres up):
1. New file `scratch.sql`: `select * from crew;` → cmd+enter → connection QuickPick → `local-pg` → password `tuplebase` → grid shows 3 rows, status `3 rows in Nms`.
2. Second run: no QuickPick (remembered), no password prompt (SecretStorage).
3. `select * from nope;` → error with pg message in panel.
4. Wrong password path: `TupleBase: Clear Stored Credentials`, run again, type wrong password → auth error → "Re-enter password" button works.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: run query command wired end to end into results grid"
```

---

### Task 12: Dogfood config, smoke test, README

**Files:**
- Create: `.tuplebase.json`, `src/test/smoke.test.ts` (test-electron), `.github/workflows/ci.yml`
- Modify: `README.md`, `package.json` (devDependencies `@vscode/test-electron@^2.4.0`, `@vscode/test-cli@^0.0.10`; script `test:vscode`)

**Interfaces:**
- Consumes: everything.
- Produces: repo opens as its own test workspace; CI runs vitest + integration (compose) + smoke.

- [ ] **Step 1: dogfood config** — `.tuplebase.json` at repo root:

```jsonc
{
  // TupleBase dev config — safe to commit: secrets are never stored here.
  // Start databases with: npm run db:postgres   (password: tuplebase)
  "defaultEnvironment": "dev",
  "environments": {
    "dev": {
      "local-pg": { "adapter": "postgres", "host": "localhost", "port": 5432, "database": "tuplebase", "user": "tuplebase" }
    }
  }
}
```

- [ ] **Step 2: smoke test**

Run: `npm install -D @vscode/test-electron@^2.4.0 @vscode/test-cli@^0.0.10`

`src/test/smoke.test.ts` (mocha-style, run by test-cli):
```ts
import * as assert from 'node:assert'
import * as vscode from 'vscode'

suite('tuplebase smoke', () => {
  test('activates and registers commands', async () => {
    const ext = vscode.extensions.getExtension('tuplebase.tuplebase')
    assert.ok(ext, 'extension found')
    await ext.activate()
    const commands = await vscode.commands.getCommands(true)
    for (const c of ['tuplebase.runQuery', 'tuplebase.selectEnvironment', 'tuplebase.clearCredentials']) {
      assert.ok(commands.includes(c), `command ${c} registered`)
    }
  })
})
```

`.vscode-test.mjs` at root:
```js
import { defineConfig } from '@vscode/test-cli'
export default defineConfig({
  files: 'dist/test/smoke.test.js',
  workspaceFolder: '.',
})
```

Add esbuild entry for the test file in `esbuild.mjs` (same host options, entry `src/test/smoke.test.ts`, outfile `dist/test/smoke.test.js`, external also `mocha`), and script: `"test:vscode": "npm run build && vscode-test"`.
Exclude `src/test/**` from vitest: in `vitest.config.ts` set `exclude: ['src/test/**', 'node_modules/**']`.

Run: `npm run test:vscode`
Expected: 1 passing.

- [ ] **Step 3: CI** — `.github/workflows/ci.yml`:

```yaml
name: ci
on:
  push: { branches: [main] }
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run check
      - run: npm run build
      - run: npm test
      - run: docker compose --profile postgres up -d --wait
      - run: TUPLEBASE_IT=1 npx vitest run
      - run: xvfb-run -a npm run test:vscode
```

- [ ] **Step 4: README** — replace body with:

```markdown
# TupleBase 🛶

Paddle through your rows. A VS Code extension for querying databases — Postgres, Redis and DynamoDB behind one extensible adapter interface.

## Status

Walking skeleton: Postgres end-to-end (config → tree → query → grid). Redis/DynamoDB adapters, autocomplete and history are next.

## Development

```bash
npm install
npm run db:postgres      # dockerized postgres, seeded (password: tuplebase)
npm run watch            # esbuild watch
# press F5 → Extension Development Host opens; this repo is its own test workspace (.tuplebase.json)
```

Tests:

```bash
npm test                 # unit (vitest)
TUPLEBASE_IT=1 npx vitest run   # + integration (needs db:postgres)
npm run test:vscode      # extension-host smoke
```

## Config

`.tuplebase.json` at your workspace root — committable, secret-free. Passwords are prompted once and stored in your OS keychain (VS Code SecretStorage). See the JSON schema for fields (IntelliSense works in the file).
```

- [ ] **Step 5: full verify**

Run: `npm run check && npm test && TUPLEBASE_IT=1 npx vitest run && npm run test:vscode`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: dogfood config, extension smoke test and ci pipeline"
```

---

## Self-review (done at plan time)

- **Spec coverage (Plan 01 scope):** config file+schema+interpolation (T4, T5), secrets+clear command (T6, T8), adapter interface (T3), postgres adapter with lazy driver/pool/cancel/paging (T7), activity bar+tree+welcome (T1, T9), status-bar env picker (T8), results WebviewView+Tabulator+CSP+state (T10), run command+keybinding+per-file binding+auth retry (T11), compose profiles+seed+dogfood (T2, T12), tests unit/integration/smoke+CI (T3-T7, T12). Deferred to Plans 02-04 per spec: redis/dynamo adapters, `.redis` language, autocomplete, history, publishing docs, license seam (`license.ts` arrives in Plan 04 with first gateable feature).
- **Type consistency:** `ExecuteOptions.signal: AbortSignal` used in T7/T11; `ResultEnvelope` shape identical in T3/T10; `SecretVault` API in T6 matches T8 usage; `ConfigStore.connections()` returns `ConnectionConfig[]` used in T8/T9/T11.
- **Placeholder scan:** none — all code complete.
```
