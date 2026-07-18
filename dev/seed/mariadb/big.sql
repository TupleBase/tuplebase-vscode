-- Large dataset for exercising results paging / grid volume.
-- Runs as the second half of the standard seed: `npm run db:seed -- mariadb`
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
