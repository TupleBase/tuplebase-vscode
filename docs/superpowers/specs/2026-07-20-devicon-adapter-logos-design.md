# Devicon adapter logos — design

**Date:** 2026-07-20
**Status:** Approved
**Scope:** Replace placeholder adapter SVGs with real devicon logos and surface
them in the New Connection picker and the run-file connection QuickPick. The
explorer tree picks them up with no code change.

## Goal

Every adapter shows its recognizable engine logo (colored devicon "original"
style) in the three places a user identifies a connection type: the explorer
tree, the New Connection picker cards, and the connection QuickPick opened from
the query CodeLens. The CodeLens text itself keeps its codicons — CodeLens
supports codicon syntax only, and an icon font is out of scope.

## Decisions

- **Source: devicon** (github.com/devicons/devicon, MIT). Colored `original`
  variants everywhere. Chosen over official brand kits (per-vendor licensing
  friction, inconsistent styles) and over simple-icons (monochrome only).
- **Vendor the SVGs.** Download once, commit under `src/adapters/<id>/`,
  overwriting the placeholder cylinder SVGs in place. No npm dependency, no
  build changes — the esbuild `copyAssets` step already ships
  `src/adapters/<id>/*.svg` to `dist/adapters/<id>/`.
- **Keep the `-connected.svg` convention.** Connected variant = same devicon
  plus a green status dot (`#3fb950`, matching the placeholder convention) at
  bottom-right, 20px radius on the 128×128 devicon canvas.
- **Fallback chain unchanged:** bundled SVG → codicon (`presentation.codicon`,
  then generic `database`). If devicon lacks an engine, its placeholder SVG
  stays until a logo is sourced.

## Devicon slugs

| Adapter | Devicon slug |
|---|---|
| postgres | `postgresql` |
| mysql | `mysql` |
| mariadb | `mariadb` |
| sqlite | `sqlite` |
| mssql | `microsoftsqlserver` |
| mongodb | `mongodb` |
| redis | `redis` |
| cassandra | `cassandra` |
| clickhouse | verify — keep placeholder if absent |
| dynamodb | `dynamodb` |
| elasticsearch | `elasticsearch` |
| kafka | `apachekafka` |
| neo4j | `neo4j` |

## Changes

### 1. Assets (`src/adapters/<id>/`)

For each adapter: fetch the devicon `original.svg`, keep the native
`viewBox="0 0 128 128"`, save as `<id>.svg`. Derive `<id>-connected.svg` by
appending the green dot circle. Placeholders are overwritten; file names and
locations do not change, so `presentation.iconFile` and the build copy step are
untouched.

### 2. Explorer tree

No change. `SchemaTreeProvider.connectionIcon()` already resolves
`dist/adapters/<id>/<id>[-connected].svg` when `iconFile` is set.

### 3. New Connection picker (`connFormPanel.ts` + `webview/connForm.ts`)

- Panel: add `dist/adapters` to `localResourceRoots`; extend each adapter entry
  in the init payload with `iconUri` (`asWebviewUri` of the adapter SVG),
  omitted when the adapter has no `iconFile`.
- Webview `renderPick()`: when `iconUri` is present render
  `<img class="card-icon" src=…>`, else keep the emoji span.
- `connForm.css`: size the image (~32px), keep card layout.

### 4. Connection QuickPick (`ui/queryCodeLens.ts`)

Set `QuickPickItem.iconPath` to the adapter SVG `Uri` for each connection item;
fall back to the codicon `ThemeIcon` when no SVG is bundled.

### 5. Attribution

Credit devicon (MIT) in the README credits section, with a note that database
logos are trademarks of their respective owners, used to indicate
compatibility.

## Error handling

No new failure paths: a missing SVG file falls back to codicons exactly as
today (tree via `connectionIcon()`, picker via emoji, QuickPick via
`ThemeIcon`).

## Testing

- `npm run check` and `npm test` (existing bar).
- `connFormSpec`/panel test: init payload carries `iconUri` per adapter and
  omits it when `iconFile` is unset.
- schemaTree tests: unchanged (icon resolution logic untouched).
- Manual F5 smoke: tree icons (disconnected + connected variants), picker
  cards, QuickPick logos, one adapter with SVG removed to confirm fallback.
