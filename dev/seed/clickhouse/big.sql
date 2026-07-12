-- Opt-in large dataset for exercising results paging / grid volume.
-- Run with: npm run db:seed:big  (or `npm run db:seed:big -- clickhouse`)
DROP TABLE IF EXISTS pagination_demo;

CREATE TABLE pagination_demo (
  id UInt32,
  label String,
  bucket UInt8,
  amount Decimal(10, 2),
  created_at DateTime
) ENGINE = MergeTree ORDER BY id;

INSERT INTO pagination_demo
SELECT number + 1,
       concat('row-', toString(number + 1)),
       (number + 1) % 50,
       (number + 1) * 7 % 1000,
       now() - toIntervalMinute(number + 1)
FROM numbers(10000);
