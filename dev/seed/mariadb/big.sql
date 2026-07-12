-- Opt-in large dataset for exercising results paging / grid volume.
-- Run with: npm run db:seed:big  (or `npm run db:seed:big -- mariadb`)
DROP TABLE IF EXISTS pagination_demo;

CREATE TABLE pagination_demo (
  id int PRIMARY KEY,
  label varchar(50) NOT NULL,
  bucket int NOT NULL,
  amount decimal(10, 2) NOT NULL,
  created_at datetime NOT NULL
);

INSERT INTO pagination_demo (id, label, bucket, amount, created_at)
SELECT seq, CONCAT('row-', seq), seq % 50, (seq * 7) % 1000, NOW() - INTERVAL seq MINUTE
FROM seq_1_to_10000;
