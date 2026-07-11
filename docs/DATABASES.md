# Database support

Which databases Rowboat speaks, and which are candidates. Shipped adapters live in `src/adapters/`; their presentation (icon/label) in `src/core/adapterCatalog.ts`.

## Shipped

| Database | `adapter` | Query surface | Notes |
|---|---|---|---|
| PostgreSQL | `postgres` | SQL | TLS (`sslmode` + CA cert), password in OS keychain |
| Redis | `redis` | commands (`.redis`, one per line) | key-namespace tree, optional `auth` |
| DynamoDB | `dynamodb` | PartiQL | AWS credential chain (profile/SSO/env), dynamodb-local `endpoint` |

## Candidates — not scheduled

Add a row when a database is requested; graduate it to **Shipped** when an adapter lands.

| Database | Query surface | Notes / wire compatibility |
|---|---|---|
| MySQL / MariaDB | SQL | frequent ask; own client protocol |
| SQLite | SQL | file-based, zero-server — great for dev/demo |
| Microsoft SQL Server | T-SQL | TDS protocol |
| MongoDB | MQL / aggregation | document store |
| CockroachDB | SQL | Postgres wire — may work through the `postgres` adapter (verify) |
| ClickHouse | SQL | HTTP / native protocol; analytics |
| Cassandra / ScyllaDB | CQL | wide-column |
| Elasticsearch / OpenSearch | query DSL | search |
| Snowflake / BigQuery | SQL | cloud warehouses |
| Neo4j | Cypher | graph |

## Adding an adapter — checklist

1. Implement `AdapterFactory` + `Adapter` in `src/adapters/<db>.ts` (model on `postgres.ts`).
2. Register it in `ConnectionManager.factories` (`src/core/connections.ts`).
3. Add it to `KNOWN_ADAPTERS` (`src/core/config.ts`) and the JSON schema (`schemas/rowboat.schema.json`).
4. Add form fields in `src/webview/connFormSpec.ts` and a catalog entry (icon/label/blurb) in `src/core/adapterCatalog.ts`.
5. Cover it: unit + live-container integration tests, plus a compose service and seed under `dev/`.
6. Move its row from **Candidates** to **Shipped** above.
