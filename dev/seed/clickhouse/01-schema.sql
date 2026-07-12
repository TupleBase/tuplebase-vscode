-- Seed for the dev ClickHouse container (mounted at /docker-entrypoint-initdb.d).
CREATE DATABASE IF NOT EXISTS tuplebase;

CREATE TABLE IF NOT EXISTS tuplebase.crew (
  id Int32,
  name String,
  role String
) ENGINE = MergeTree ORDER BY id;

INSERT INTO tuplebase.crew (id, name, role) VALUES
  (1, 'ada', 'captain'),
  (2, 'grace', 'navigator'),
  (3, 'hedy', 'engineer');
