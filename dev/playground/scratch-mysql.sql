-- MySQL / MariaDB demo (npm run db:start -- mysql && npm run db:seed -- mysql (same for mariadb)) — cmd+enter runs one statement.
-- Bind this file to the local-mysql (or local-mariadb) connection.
SELECT id, name, role FROM crew ORDER BY id;

SELECT name, JSON_EXTRACT(meta, '$.rank') AS `rank`
FROM crew WHERE meta IS NOT NULL ORDER BY `rank`;

-- Mutations — a read-only connection blocks these
UPDATE crew SET role = 'first mate' WHERE name = 'grace';

INSERT INTO crew (id, name, role, meta) VALUES (4, 'lin', 'cook', '{"rank": 4}');
