// Leading keywords that make a SQL-family statement a write (DML + DDL). Shared by
// the postgres/mysql/sqlite/mssql/clickhouse/cassandra presentations' writeRule —
// anything else (SELECT/WITH/SHOW/DESCRIBE/EXPLAIN/…) is a read.
export const SQL_WRITE_KEYWORDS = [
  'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'GRANT', 'REVOKE',
  'MERGE', 'CALL', 'DO', 'COPY', 'VACUUM', 'ANALYZE', 'REFRESH', 'RENAME', 'REPLACE',
  'UPSERT', 'EXEC', 'EXECUTE', 'OPTIMIZE', 'SET', 'LOAD', 'BATCH', 'BEGIN', 'COMMIT',
] as const
