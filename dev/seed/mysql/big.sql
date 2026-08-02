-- Large dataset for exercising results paging / grid volume, plus a wide table
-- catalog for exercising the Explorer's table filter.
-- Runs as the second half of the standard seed: `npm run db:seed -- mysql`
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

-- ── Wide catalog ─────────────────────────────────────────────────────────────
-- 320 tables across six naming families, so the Explorer's table filter has
-- something real to narrow: typing "audit" or "orders_shard" in the picker
-- should cut the list down hard. They are intentionally empty — this exercises
-- the catalog listing, not the grid (pagination_demo above covers volume).
--
-- Idempotent: each family drops before it creates, so reseeding is safe. The
-- generated names are deterministic, which is what makes that possible.
DROP PROCEDURE IF EXISTS make_numbered_tables;
DROP PROCEDURE IF EXISTS make_month_tables;

DELIMITER $$

-- <prefix>000 … <prefix>NNN
CREATE PROCEDURE make_numbered_tables(IN prefix VARCHAR(64), IN n INT)
BEGIN
  DECLARE i INT DEFAULT 0;
  WHILE i < n DO
    SET @name = CONCAT(prefix, LPAD(i, 3, '0'));
    SET @ddl = CONCAT('DROP TABLE IF EXISTS `', @name, '`');
    PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
    SET @ddl = CONCAT(
      'CREATE TABLE `', @name, '` (',
      '  id int PRIMARY KEY,',
      '  label varchar(50) NOT NULL,',
      '  amount decimal(10, 2) NOT NULL DEFAULT 0,',
      '  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
    SET i = i + 1;
  END WHILE;
END$$

-- <prefix>YYYY_MM, `years` years starting at `y0`
CREATE PROCEDURE make_month_tables(IN prefix VARCHAR(64), IN y0 INT, IN years INT)
BEGIN
  DECLARE y INT DEFAULT 0;
  DECLARE m INT DEFAULT 0;
  SET y = y0;
  WHILE y < y0 + years DO
    SET m = 1;
    WHILE m <= 12 DO
      SET @name = CONCAT(prefix, y, '_', LPAD(m, 2, '0'));
      SET @ddl = CONCAT('DROP TABLE IF EXISTS `', @name, '`');
      PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
      SET @ddl = CONCAT(
        'CREATE TABLE `', @name, '` (',
        '  id int PRIMARY KEY,',
        '  actor varchar(50) NOT NULL,',
        '  action varchar(50) NOT NULL,',
        '  at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP)');
      PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
      SET m = m + 1;
    END WHILE;
    SET y = y + 1;
  END WHILE;
END$$

DELIMITER ;

CALL make_numbered_tables('orders_shard_', 64);
CALL make_numbered_tables('user_event_', 80);
CALL make_numbered_tables('metrics_daily_', 50);
CALL make_numbered_tables('tmp_import_', 30);
CALL make_numbered_tables('legacy_billing_', 24);
CALL make_month_tables('audit_log_', 2019, 6);

DROP PROCEDURE make_numbered_tables;
DROP PROCEDURE make_month_tables;
