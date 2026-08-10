# Changelog

All notable changes to TupleBase are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/TupleBase/tuplebase-vscode/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/TupleBase/tuplebase-vscode/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/TupleBase/tuplebase-vscode/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/TupleBase/tuplebase-vscode/releases/tag/v0.1.0
