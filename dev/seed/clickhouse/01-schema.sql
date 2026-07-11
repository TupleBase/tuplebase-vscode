-- Seed for the dev ClickHouse container (mounted at /docker-entrypoint-initdb.d).
CREATE DATABASE IF NOT EXISTS rowboat;

CREATE TABLE IF NOT EXISTS rowboat.crew (
  id Int32,
  name String,
  role String
) ENGINE = MergeTree ORDER BY id;

INSERT INTO rowboat.crew (id, name, role) VALUES
  (1, 'ada', 'captain'),
  (2, 'grace', 'navigator'),
  (3, 'hedy', 'engineer');
