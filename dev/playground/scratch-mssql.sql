-- SQL Server (T-SQL) demo (npm run db:mssql) — bind to the local-mssql connection.
SELECT id, name, role FROM dbo.crew ORDER BY id;

SELECT role, COUNT(*) AS n FROM dbo.crew GROUP BY role;

-- T-SQL paging uses OFFSET/FETCH (needs ORDER BY)
SELECT * FROM dbo.crew ORDER BY id OFFSET 0 ROWS FETCH NEXT 2 ROWS ONLY;

-- Mutations — a read-only connection blocks these
UPDATE dbo.crew SET role = 'first mate' WHERE name = 'grace';

INSERT INTO dbo.crew (id, name, role) VALUES (4, 'lin', 'cook');
