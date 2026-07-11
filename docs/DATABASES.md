# Database support

Which databases Rowboat speaks, and which are candidates. Each database is a self-contained plugin under `src/adapters/<db>/` (adapter, form fields, presentation, completion, icon), collected in `src/adapters/registry.ts`.

## Shipped

| Database | `adapter` | Query surface | Notes |
|---|---|---|---|
| PostgreSQL | `postgres` | SQL | TLS (`sslmode` + CA cert), password in OS keychain |
| MySQL | `mysql` | SQL | schemas → tables → columns tree, JSON columns, password in OS keychain |
| Redis | `redis` | commands (`.redis`, one per line) | key-namespace tree, optional `auth` |
| DynamoDB | `dynamodb` | PartiQL | AWS credential chain (profile/SSO/env), dynamodb-local `endpoint` |
| CockroachDB | `postgres` | SQL | speaks the Postgres wire protocol — use the `postgres` adapter (verified: schema tree + queries work) |

## Candidates — not scheduled

Add a row when a database is requested; graduate it to **Shipped** when an adapter lands.

| Database | Query surface | Notes / wire compatibility |
|---|---|---|
| MariaDB | SQL | likely works through the `mysql` adapter — verify |
| SQLite | SQL | file-based, zero-server — great for dev/demo |
| Microsoft SQL Server | T-SQL | TDS protocol |
| MongoDB | MQL / aggregation | document store |
| ClickHouse | SQL | HTTP / native protocol; analytics |
| Cassandra / ScyllaDB | CQL | wide-column |
| Elasticsearch / OpenSearch | query DSL | search |
| Snowflake / BigQuery | SQL | cloud warehouses |
| Neo4j | Cypher | graph |
| Apache Kafka | topic browse / consume | event streaming, not a DB — list topics/partitions, tail messages (key/value + headers/offset) |

## Adding an adapter — checklist

Adapters are self-contained: create the folder, then register it in one line.

1. Create `src/adapters/<db>/` with:
   - `adapter.ts` — `Adapter` + `AdapterFactory` (model on `postgres/adapter.ts`); set `languageId` and `statementSyntax`.
   - `completion.ts` — a `CompletionContribution` (optional).
   - `<db>.svg` (+ `<db>-connected.svg`) — the tree icon.
   - `index.ts` — the `AdapterDescriptor` tying presentation (label/emoji/blurb/icon/fields), factory and completion together.
2. Add the descriptor to the `ADAPTERS` array in `src/adapters/registry.ts` — the one line. Config validation, the connection form, tree icons, completion and the connection manager all read from the registry.
3. Regenerate the JSON schema from the descriptors: `npm run gen:schema`.
4. Cover it: unit + live-container integration tests, plus a compose service and seed under `dev/`.
5. Move its row from **Candidates** to **Shipped** above.
