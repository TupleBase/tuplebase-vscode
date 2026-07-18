# Changelog

All notable changes to TupleBase are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-07-18 (pre-release)

### Added

- PostgreSQL connections with schema browsing, SQL completion, query CodeLens actions, and SSH tunnel support.
- Project-level `.tuplebase.json` configuration with groups, read-only controls, and credentials stored outside the file in VS Code Secret Storage.
- Statement and whole-file execution from the editor into a themed, paginated results grid with row detail views.
- Per-workspace query history with rerun support.
- A bundled MCP server for listing connections, inspecting schemas, and running queries, with agent writes blocked by default.

[Unreleased]: https://github.com/TupleBase/tuplebase-vscode/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/TupleBase/tuplebase-vscode/releases/tag/v0.1.0
