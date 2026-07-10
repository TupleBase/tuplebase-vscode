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
