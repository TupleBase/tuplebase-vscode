-- Postgres harbor operations — cmd+enter runs the statement under the cursor
SELECT c.name, c.role, p.code AS home_port
FROM crew AS c
JOIN ports AS p ON p.id = c.home_port_id
WHERE c.active
ORDER BY c.name;

SELECT v.id, b.name AS boat, origin.code AS origin, destination.code AS destination, v.status
FROM voyages AS v
JOIN boats AS b ON b.id = v.boat_id
JOIN ports AS origin ON origin.id = v.origin_port_id
JOIN ports AS destination ON destination.id = v.destination_port_id
ORDER BY v.departed_at DESC;

-- Mutations — run these against a writable connection; a read-only connection
-- blocks them (Plan 04 guardrail).
INSERT INTO ports (code, name, country, latitude, longitude)
VALUES ('SDR', 'Santander', 'Spain', 43.46230, -3.80990);

UPDATE crew SET role = 'first mate' WHERE name = 'linus';

DELETE FROM maintenance_logs WHERE resolved_at IS NOT NULL;

-- Paging demo — part of the standard seed (npm run db:seed) (10,000 rows)
SELECT count(*) FROM pagination_demo;                          -- 10000
SELECT * FROM pagination_demo ORDER BY id;                     -- full set; the grid pages it
SELECT * FROM pagination_demo ORDER BY id LIMIT 100 OFFSET 0;  -- page 1
SELECT * FROM pagination_demo ORDER BY id LIMIT 100 OFFSET 100; -- page 2
SELECT bucket, count(*), round(avg(amount), 2) AS avg_amount
FROM pagination_demo GROUP BY bucket ORDER BY bucket;          -- 50 buckets
