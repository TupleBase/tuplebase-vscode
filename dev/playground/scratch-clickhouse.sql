-- ClickHouse demo (npm run db:clickhouse) — bind to the local-clickhouse connection.
SELECT id, name, role FROM crew ORDER BY id;

SELECT role, count() AS n FROM crew GROUP BY role ORDER BY n DESC;

-- Browse the catalog
SELECT name, engine FROM system.tables WHERE database = 'rowboat';

-- Insert (ClickHouse is append-oriented; a read-only connection blocks it)
INSERT INTO crew (id, name, role) VALUES (4, 'lin', 'cook');
