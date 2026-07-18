-- Seed for the dev ClickHouse container — piped in by dev/db.mjs (up / seed).
-- Idempotent: drops and recreates, so the same file reseeds a running container.
CREATE DATABASE IF NOT EXISTS tuplebase;

DROP TABLE IF EXISTS tuplebase.crew;

CREATE TABLE tuplebase.crew (
  id Int32,
  name String,
  role String
) ENGINE = MergeTree ORDER BY id;

INSERT INTO tuplebase.crew (id, name, role) VALUES
  (1, 'ada', 'captain'),
  (2, 'grace', 'navigator'),
  (3, 'hedy', 'engineer');
