-- Opt-in large dataset for exercising results paging / grid volume.
-- Run with: npm run db:seed:big  (or `npm run db:seed:big -- mysql`)
SET SESSION cte_max_recursion_depth = 10000;

DROP TABLE IF EXISTS pagination_demo;

CREATE TABLE pagination_demo (
  id int PRIMARY KEY,
  label varchar(50) NOT NULL,
  bucket int NOT NULL,
  amount decimal(10, 2) NOT NULL,
  created_at datetime NOT NULL
);

INSERT INTO pagination_demo (id, label, bucket, amount, created_at)
WITH RECURSIVE seq (n) AS (
  SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 10000
)
SELECT n, CONCAT('row-', n), n % 50, (n * 7) % 1000, NOW() - INTERVAL n MINUTE
FROM seq;
