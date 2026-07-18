# Database support

Which databases TupleBase speaks, and which are candidates. Each database is a self-contained plugin under `src/adapters/<db>/` (adapter, form fields, presentation, completion, icon), collected in `src/adapters/registry.ts`.

## Supported engines

Adapters roll out gradually per release. **Preview** engines are enabled today; **Coming soon** engines stay registered but invisible (not offered in the form, skipped in configs) until they're enabled. See the "Gradual rollout" section in [ARCHITECTURE.md](ARCHITECTURE.md).

| Database | Status | `adapter` | Query surface | Notes |
|---|---|---|---|---|
| PostgreSQL | Preview | `postgres` | SQL | TLS (`sslmode` + CA cert), password in OS keychain |
| MySQL | Coming soon | `mysql` | SQL | schemas → tables → columns tree, JSON columns, password in OS keychain |
| SQLite | Coming soon | `sqlite` | SQL | file-based (`path`), no server/password; pure-JS driver (sql.js), writes persist to the file |
| SQL Server | Coming soon | `mssql` | T-SQL | `mssql` (tedious) driver; `information_schema` schema tree, optional `encrypt` (server cert trusted) |
| ClickHouse | Coming soon | `clickhouse` | SQL | analytics; HTTP driver (`@clickhouse/client`), `database`/`user` + optional `auth`, `system.*` schema tree |
| Cassandra | Coming soon | `cassandra` | CQL | wide-column; `cassandra-driver`, `datacenter`/`keyspace` + optional `auth`; native `pageState` paging, `system_schema.*` tree |
| Neo4j | Coming soon | `neo4j` | Cypher | graph; `neo4j-driver` (Bolt), labels→properties tree, own Cypher completion, `SKIP`/`LIMIT` paging |
| MongoDB | Coming soon | `mongodb` | MQL (`db.coll.method(json)`) | document store; `find`/`aggregate`/`count`/`distinct` + inserts/updates/deletes, collections→sampled-fields tree, `skip`/`limit` paging |
| Elasticsearch | Coming soon | `elasticsearch` | query DSL (`METHOD /path {json}`) | Kibana-console style; `_search` hits flatten to rows (`from`/`size` paging), indices→mapping-fields tree; OpenSearch works too |
| Kafka | Coming soon | `kafka` | commands (`topics` / `describe` / `consume`) | not a DB — list topics/partitions and tail messages (partition/offset/key/value/timestamp); topics→partitions tree |
| Redis | Coming soon | `redis` | commands (`.redis`, one per line) | key-namespace tree, optional `auth` |
| DynamoDB | Coming soon | `dynamodb` | PartiQL | AWS credential chain (profile/SSO/env), dynamodb-local `endpoint` |
| CockroachDB | Coming soon | `postgres` | SQL | speaks the Postgres wire protocol — use the `postgres` adapter (verified: schema tree + queries work) |
| MariaDB | Coming soon | `mysql` | SQL | speaks the MySQL wire protocol — use the `mysql` adapter (verified: schema tree + queries work) |

## Candidates — not scheduled

Add a row when a database is requested; graduate it to **Supported engines** when an adapter lands.

| Database | Query surface | Notes / wire compatibility |
|---|---|---|
| ScyllaDB | CQL | wide-column — Cassandra-compatible, use the `cassandra` adapter |
| OpenSearch | query DSL | search — Elasticsearch-compatible, use the `elasticsearch` adapter |
| Snowflake / BigQuery | SQL | cloud warehouses |

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
5. Move its row from **Candidates** to **Supported engines** above.
