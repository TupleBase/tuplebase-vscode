# Database support

Which databases Rowboat speaks, and which are candidates. Each database is a self-contained plugin under `src/adapters/<db>/` (adapter, form fields, presentation, completion, icon), collected in `src/adapters/registry.ts`.

## Shipped

| Database | `adapter` | Query surface | Notes |
|---|---|---|---|
| PostgreSQL | `postgres` | SQL | TLS (`sslmode` + CA cert), password in OS keychain |
| MySQL | `mysql` | SQL | schemas → tables → columns tree, JSON columns, password in OS keychain |
| SQLite | `sqlite` | SQL | file-based (`path`), no server/password; pure-JS driver (sql.js), writes persist to the file |
| SQL Server | `mssql` | T-SQL | `mssql` (tedious) driver; `information_schema` schema tree, optional `encrypt` (server cert trusted) |
| ClickHouse | `clickhouse` | SQL | analytics; HTTP driver (`@clickhouse/client`), `database`/`user` + optional `auth`, `system.*` schema tree |
| Cassandra | `cassandra` | CQL | wide-column; `cassandra-driver`, `datacenter`/`keyspace` + optional `auth`; native `pageState` paging, `system_schema.*` tree |
| Neo4j | `neo4j` | Cypher | graph; `neo4j-driver` (Bolt), labels→properties tree, own Cypher completion, `SKIP`/`LIMIT` paging |
| MongoDB | `mongodb` | MQL (`db.coll.method(json)`) | document store; `find`/`aggregate`/`count`/`distinct` + inserts/updates/deletes, collections→sampled-fields tree, `skip`/`limit` paging |
| Redis | `redis` | commands (`.redis`, one per line) | key-namespace tree, optional `auth` |
| DynamoDB | `dynamodb` | PartiQL | AWS credential chain (profile/SSO/env), dynamodb-local `endpoint` |
| CockroachDB | `postgres` | SQL | speaks the Postgres wire protocol — use the `postgres` adapter (verified: schema tree + queries work) |
| MariaDB | `mysql` | SQL | speaks the MySQL wire protocol — use the `mysql` adapter (verified: schema tree + queries work) |

## Candidates — not scheduled

Add a row when a database is requested; graduate it to **Shipped** when an adapter lands.

| Database | Query surface | Notes / wire compatibility |
|---|---|---|
| ScyllaDB | CQL | wide-column — Cassandra-compatible, use the `cassandra` adapter |
| Elasticsearch / OpenSearch | query DSL | search |
| Snowflake / BigQuery | SQL | cloud warehouses |
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
