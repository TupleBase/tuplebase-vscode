# Security policy

## Supported versions

Security fixes are provided for the latest TupleBase release, including the current pre-release while the project is in preview. Please update to the newest available version before reporting a problem.

## Reporting a vulnerability

Email [hello@tuplebase.app](mailto:hello@tuplebase.app) with:

- the affected TupleBase version;
- a description of the issue and its potential impact;
- steps or a minimal example that reproduce it; and
- any known mitigations.

Please do not disclose suspected vulnerabilities in a public GitHub issue. We will confirm receipt, investigate the report, and coordinate any fix and disclosure with you.

## Data handling

TupleBase does not collect telemetry or send usage data to TupleBase. It connects only to database and SSH endpoints configured by the user.

Database credentials are excluded from `.tuplebase.json` and stored through VS Code Secret Storage. The generated MCP client configuration contains the credentials needed by the standalone MCP server in plaintext; treat that generated configuration like any other credentials file.
