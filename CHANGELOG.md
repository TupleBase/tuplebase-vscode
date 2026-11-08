# Changelog

All notable changes to TupleBase are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-11-08 (pre-release)

### Added

- TLS for MySQL and MariaDB connections: `sslmode` (`disable`, `require`, `verify-ca`, `verify-full`), with `sslrootcert` for the CA certificate.

### Changed

- **SSH tunnels now require `ssh.hostFingerprint`**, the server's trusted OpenSSH `SHA256:...` host-key fingerprint. Existing connections with an `ssh` block must add it.
- Connections report their real state (connecting, connected, error) from a live check, and a dropped connection shows as an error.

### Fixed

- Read-only checks now catch writes hidden behind `WITH`, `EXPLAIN ANALYZE`, `SELECT INTO`, and multi-statement queries, and no longer flag write keywords inside strings or comments.
- Changing a connection's settings reconnects with the new configuration, and removing a connection closes its session. A connect still in progress is cancelled on disconnect and shutdown.
- Clearing credentials waits for in-flight connects, so a cancelled prompt can't store a secret afterward.
- Plaintext secrets in `.tuplebase.json` are now flagged on disabled or unknown adapters too.
- Results grid hover, selection, and tooltips follow the active VS Code theme.

### Security

- Updated dependencies to resolve published security advisories. `npm audit --omit=dev` reports no known vulnerabilities at release.

## [0.2.0] - 2026-08-10

First stable release.

### Added

- Explorer table filter — limit which tables the tree shows per schema, with an indicator while a filter is active.
- Dedicated icons for schema, table, column, and primary-key nodes in the explorer tree.

### Fixed

- Connection form controls (password input, checkboxes, dropdown) now follow the active VS Code theme instead of rendering in browser-default light styling.
- Dead connections are dropped from the explorer on refresh.

## [0.1.1] - 2026-07-20 (pre-release)

### Added

- MySQL connections — schema tree, SQL completion, paginated queries, password in OS keychain.
- MariaDB as its own connection type (`adapter: "mariadb"`), backed by the same wire-compatible MySQL driver.
- Database brand logos on the connection type picker and file connection picker.

## [0.1.0] - 2026-07-18 (pre-release)

### Added

- PostgreSQL connections with schema browsing, SQL completion, query CodeLens actions, and SSH tunnel support.
- Project-level `.tuplebase.json` configuration with groups, read-only controls, and credentials stored outside the file in VS Code Secret Storage.
- Statement and whole-file execution from the editor into a themed, paginated results grid with row detail views.
- Per-workspace query history with rerun support.
- A bundled MCP server for listing connections, inspecting schemas, and running queries, with agent writes blocked by default.

[Unreleased]: https://github.com/TupleBase/tuplebase-vscode/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/TupleBase/tuplebase-vscode/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/TupleBase/tuplebase-vscode/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/TupleBase/tuplebase-vscode/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/TupleBase/tuplebase-vscode/releases/tag/v0.1.0
