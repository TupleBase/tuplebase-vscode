-- Cassandra (CQL) demo (npm run db:cassandra) — bind to the local-cassandra connection
-- (keyspace tuplebase). Results page with the driver's native pageState token.
SELECT id, name, role FROM crew;

SELECT name, role FROM crew WHERE id = 1;

-- Mutations (CQL upserts) — a read-only connection blocks these
INSERT INTO crew (id, name, role) VALUES (4, 'lin', 'cook');

UPDATE crew SET role = 'first mate' WHERE id = 2;
