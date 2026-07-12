-- Opt-in large dataset for exercising results paging / grid volume.
-- Run with: npm run db:seed:big  (or `npm run db:seed:big -- postgres`)
DROP TABLE IF EXISTS pagination_demo;

CREATE TABLE pagination_demo (
  id int PRIMARY KEY,
  label text NOT NULL,
  bucket int NOT NULL,
  amount numeric(10, 2) NOT NULL,
  created_at timestamptz NOT NULL
);

INSERT INTO pagination_demo (id, label, bucket, amount, created_at)
SELECT g,
       'row-' || g,
       g % 50,
       round((random() * 1000)::numeric, 2),
       now() - (g || ' minutes')::interval
FROM generate_series(1, 10000) AS g;
