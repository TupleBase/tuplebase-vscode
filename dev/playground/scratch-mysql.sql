-- MySQL demo (npm run db:start -- mysql && npm run db:seed -- mysql) — cmd+enter runs one statement.
-- Bind this file to the local-mysql connection.
SELECT id, name, role FROM crew ORDER BY id;

SELECT name, JSON_EXTRACT(meta, '$.rank') AS `rank`
FROM crew WHERE meta IS NOT NULL ORDER BY `rank`;

-- Mutations — a read-only connection blocks these
UPDATE crew SET role = 'first mate' WHERE name = 'grace';

INSERT INTO crew (id, name, role, meta) VALUES (4, 'lin', 'cook', '{"rank": 4}');

-- Paging demo — part of the standard seed (npm run db:seed -- mysql) (10,000 rows)
SELECT count(*) FROM pagination_demo;                           -- 10000
SELECT * FROM pagination_demo ORDER BY id;                      -- full set; the grid pages it
SELECT * FROM pagination_demo ORDER BY id LIMIT 100 OFFSET 0;   -- page 1
SELECT * FROM pagination_demo ORDER BY id LIMIT 100 OFFSET 100; -- page 2
SELECT bucket, count(*), ROUND(AVG(amount), 2) AS avg_amount
FROM pagination_demo GROUP BY bucket ORDER BY bucket;           -- 50 buckets
