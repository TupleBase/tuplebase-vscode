# Testing TupleBase

## Prerequisites

Setup, launch configs and the `db:start` / `db:seed` container commands live in [DEVELOPMENT.md](DEVELOPMENT.md). Start the engines the tests you're running need — or `npm run db:start -- all && npm run db:seed` for everything.

## Manual testing (Extension Development Host)

Run the extension per [DEVELOPMENT.md](DEVELOPMENT.md#setup--run) (`npm run watch` + **F5**), then exercise:

- **Schema explorer** — TupleBase icon in the activity bar; expand schemas and tables.
- **Connection binding** — first run on an unbound file prompts a connection picker; the binding sticks per file.
- **Run a query** — open a `.sql` file, write a query, press **cmd+enter**. Results render in the Tabulator grid with paging and cancel.
- **Redis** — open `scratch.redis` (one command per line, `#` comments), cursor on a line, **cmd+enter**. The explorer shows key namespaces grouped on `:`.
- **Fixtures** — the local harbor dataset includes joined Postgres tables, Redis strings/hashes/lists/sets/sorted sets/streams, and DynamoDB composite-key tables with LSI/GSI metadata and nested document values.
- **Password prompt** — first connection asks for the password (`tuplebase`) and stores it in the OS keychain (VS Code SecretStorage). It won't ask again.

## Automated tests

Three layers:

```bash
npm test                 # unit + SQLite integration (vitest) — no external services (SQLite is file-based)
TUPLEBASE_IT=1 npx vitest run   # unit + integration — needs each engine up (postgres, mysql, mariadb, mssql, clickhouse, cassandra, neo4j, mongodb, elasticsearch, kafka, redis, dynamo). `npm run db:start -- all && npm run db:seed` starts and seeds them all.
npm run test:vscode      # extension-host smoke test — downloads VS Code, launches the
                         # extension inside it, runs @vscode/test suite
```

CI (`.github/workflows/ci.yml`) runs on every push and PR as two jobs: a **unit** job (check + build + `npm test` + VS Code smoke, no containers) and an **integration** matrix — one job per engine, each booting only its own container and running that adapter's IT. The heavy images (SQL Server, Cassandra, Elasticsearch, …) can't all co-reside on a single runner, so they're split per job rather than run together.

## Release workflow

`.github/workflows/release.yml` tests and packages one VSIX, then publishes that exact artifact independently to the VS Code Marketplace and Open VSX. A successful tagged release also creates a GitHub release with the VSIX attached.

- A `v<package-version>` tag publishes automatically. The tag must match `package.json` exactly.
- Odd minor versions are prereleases (`0.1.x`, `0.3.x`); even minor versions are stable (`0.2.x`, `0.4.x`). Keep the manifest version as plain SemVer without a prerelease suffix.
- A manual workflow run defaults to package-only. Select a channel and enable **Publish** only when the same version is not already published.
- Publishing jobs use the protected `release` GitHub Environment and its `VSCE_PAT` and `OVSX_PAT` secrets. GitHub releases use the automatic `GITHUB_TOKEN`.

Configure that environment once:

1. Create `VSCE_PAT` in [Azure DevOps](https://dev.azure.com/): choose **All accessible organizations** and the custom **Marketplace → Manage** scope. The Microsoft account must have access to the `tuplebase` Marketplace publisher. Microsoft retires global Azure DevOps PATs on December 1, 2026, so migrate this job to [Microsoft Entra ID publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#secure-automated-publishing-to-visual-studio-marketplace) before then.
2. Create `OVSX_PAT` from [Open VSX Access Tokens](https://open-vsx.org/user-settings/tokens). The account must have publishing access to the `tuplebase` namespace and have accepted the Eclipse Publisher Agreement.
3. Store both as environment secrets without putting their values in shell history:

```bash
gh api --method PUT repos/TupleBase/tuplebase-vscode/environments/release
gh secret set VSCE_PAT --env release --repo TupleBase/tuplebase-vscode
gh secret set OVSX_PAT --env release --repo TupleBase/tuplebase-vscode
gh secret list --env release --repo TupleBase/tuplebase-vscode
```

Optionally add required reviewers under **Repository Settings → Environments → release** so publishing requires explicit approval after the package job passes.

To cut the first prerelease after CI is green and the environment secrets are configured:

```bash
git tag -a v0.1.0 -m "v0.1.0"
git push origin v0.1.0
```

Users install a prerelease from the extension's Marketplace page by selecting **Switch to Pre-Release Version**. Prereleases are also downloadable as VSIX artifacts from the workflow run and tagged GitHub release.

## Resetting state

Reseeding databases and clearing stored credentials: see [DEVELOPMENT.md](DEVELOPMENT.md#reseed--reset).
