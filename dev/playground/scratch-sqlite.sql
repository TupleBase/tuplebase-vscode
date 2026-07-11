-- SQLite demo (npm run db:sqlite builds demo.sqlite) — cmd+enter runs one statement
SELECT c.name, c.role, p.code AS home_port
FROM crew AS c
JOIN ports AS p ON p.id = c.home_port_id
ORDER BY c.name;

SELECT name, json_extract(meta, '$.rank') AS rank
FROM crew
WHERE meta IS NOT NULL
ORDER BY rank;

-- Mutations — writes persist back to the file; a read-only connection blocks them
INSERT INTO ports (code, name, country) VALUES ('BCN', 'Barcelona', 'Spain');

UPDATE crew SET role = 'first mate' WHERE name = 'grace';

-- Paging demo — the +1 sentinel windows unbounded reads; the grid pages them
SELECT * FROM crew ORDER BY id;
