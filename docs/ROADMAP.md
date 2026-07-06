# Rowboat Roadmap

Design spec lives outside the repo (personal vault). Detailed per-task plans are written when a plan starts; this file is the quick overview.

## Done — Plan 01: Walking skeleton (merged 2026-07-05)

Postgres end-to-end: `.rowboat.json` config (JSONC, secret-free, `${env:VAR}` interpolation, JSON-schema IntelliSense) → activity-bar schema explorer → environment picker in status bar → run SQL from editor (cmd+enter) → Tabulator results grid with cancel and paging. Passwords prompted once, stored in OS keychain (SecretStorage). Dockerized dev postgres (`npm run db:postgres`), 31 tests (unit + live-container integration), VS Code smoke test, CI on GitHub Actions.

## Next — Plan 02: Redis + DynamoDB adapters

1. Statement splitter upgrade: double-quoted identifiers + dollar-quoted strings (bites first when dogfooding Postgres)
2. Compose services + seed script for redis and dynamodb-local (`db:redis`, `db:dynamo`, `db:seed`)
3. Redis adapter: commands from `.redis` files (one per line, `#` comments), key-namespace tree, optional `"auth": true` → password prompt
4. `.redis` language contribution + per-language run extraction (SQL statement vs redis line)
5. DynamoDB adapter: PartiQL via AWS SDK v3, tables/keys/GSI tree, AWS credential chain (profile/SSO/env — never stored), `endpoint` for dynamodb-local
6. Cleanup batch: ~15 deferred minors from Plan 01 reviews (stable tree ids, tightened auth-error regex, CI dedup, etc.)

## Plan 03: Autocomplete + query history

- SQL completion from the schema-tree cache (tables after FROM/JOIN, columns after `alias.`) — heuristics first, dt-sql-parser later if needed
- Redis command completion (static table) + key completion via SCAN
- PartiQL keywords + table/attribute completion from the Dynamo cache
- Query history: JSONL per workspace, history tree in the sidebar, click to rerun

## Plan 04: Publishing

- Marketplace publisher setup (Entra ID auth — PATs die Dec 2026), `@vscode/vsce`, icon/keywords/manifest polish
- Publish 0.1.x pre-release early (reserves namespace, starts verified-publisher clock); odd/even minor = pre-release/release
- Open VSX too (Cursor/Windsurf/VSCodium)
- CI publish job on tag; THIRD-PARTY-NOTICES generation
- Monetization seam only: `license.ts` with `isProEnabled() => true` — nothing else

## Deferred (tracked, not scheduled)

Dotted-identifier tree ids, pg cancellation integration test, `testConnection(cfg)` arg handling, webview pending-queue single slot, statement-splitter for PartiQL edge cases.
