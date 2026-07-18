-- Seed for the dev Postgres container — piped in by dev/db.mjs (up / seed).
-- Idempotent: drops and recreates, so the same file reseeds a running container.
DROP TABLE IF EXISTS maintenance_logs, cargo_manifests, voyage_crew, voyages, boats, crew, ports CASCADE;

CREATE TABLE ports (
  id serial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  country text NOT NULL,
  latitude numeric(8, 5) NOT NULL,
  longitude numeric(8, 5) NOT NULL
);

CREATE TABLE crew (
  id serial PRIMARY KEY,
  name text NOT NULL,
  role text NOT NULL,
  email text NOT NULL UNIQUE,
  home_port_id int REFERENCES ports(id),
  joined date NOT NULL DEFAULT current_date,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE boats (
  id serial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  registration text NOT NULL UNIQUE,
  capacity int NOT NULL CHECK (capacity > 0),
  launched_on date,
  status text NOT NULL CHECK (status IN ('active', 'maintenance', 'retired'))
);

CREATE TABLE voyages (
  id serial PRIMARY KEY,
  boat_id int NOT NULL REFERENCES boats(id),
  origin_port_id int NOT NULL REFERENCES ports(id),
  destination_port_id int NOT NULL REFERENCES ports(id),
  departed_at timestamptz NOT NULL,
  arrived_at timestamptz,
  status text NOT NULL CHECK (status IN ('planned', 'underway', 'completed', 'cancelled')),
  distance_nm numeric(8, 1) NOT NULL CHECK (distance_nm > 0)
);

CREATE TABLE voyage_crew (
  voyage_id int NOT NULL REFERENCES voyages(id) ON DELETE CASCADE,
  crew_id int NOT NULL REFERENCES crew(id),
  duty text NOT NULL,
  boarded_at timestamptz NOT NULL,
  PRIMARY KEY (voyage_id, crew_id)
);

CREATE TABLE cargo_manifests (
  id serial PRIMARY KEY,
  voyage_id int NOT NULL REFERENCES voyages(id) ON DELETE CASCADE,
  description text NOT NULL,
  weight_kg numeric(10, 2) NOT NULL CHECK (weight_kg >= 0),
  hazardous boolean NOT NULL DEFAULT false,
  declared_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE maintenance_logs (
  id serial PRIMARY KEY,
  boat_id int NOT NULL REFERENCES boats(id),
  logged_by_crew_id int REFERENCES crew(id),
  category text NOT NULL,
  notes text NOT NULL,
  logged_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX voyages_status_departed_idx ON voyages (status, departed_at DESC);
CREATE INDEX cargo_manifests_voyage_idx ON cargo_manifests (voyage_id);
CREATE INDEX maintenance_logs_boat_idx ON maintenance_logs (boat_id, logged_at DESC);

INSERT INTO ports (code, name, country, latitude, longitude) VALUES
  ('LIS', 'Lisbon', 'Portugal', 38.72230, -9.13930),
  ('OPO', 'Porto', 'Portugal', 41.15790, -8.62910),
  ('VGO', 'Vigo', 'Spain', 42.24060, -8.72070),
  ('BOD', 'Bordeaux', 'France', 44.83780, -0.57920),
  ('DUB', 'Dublin', 'Ireland', 53.34980, -6.26030),
  ('REK', 'Reykjavik', 'Iceland', 64.14660, -21.94260);

INSERT INTO crew (name, role, email, home_port_id, joined, active) VALUES
  ('ada', 'captain', 'ada@tuplebase.local', 1, '2021-03-14', true),
  ('linus', 'rower', 'linus@tuplebase.local', 2, '2022-07-21', true),
  ('grace', 'navigator', 'grace@tuplebase.local', 1, '2020-11-09', true),
  ('margaret', 'engineer', 'margaret@tuplebase.local', 4, '2023-01-18', true),
  ('donald', 'deckhand', 'donald@tuplebase.local', 3, '2024-04-04', true),
  ('barbara', 'medic', 'barbara@tuplebase.local', 5, '2023-09-12', true),
  ('ken', 'rower', 'ken@tuplebase.local', 2, '2022-12-01', false),
  ('frances', 'quartermaster', 'frances@tuplebase.local', 6, '2021-08-30', true);

INSERT INTO boats (name, registration, capacity, launched_on, status) VALUES
  ('TupleBase One', 'TB-001', 6, '2018-05-12', 'active'),
  ('TupleBase Two', 'TB-002', 8, '2020-08-23', 'active'),
  ('Tide Turner', 'TB-003', 10, '2016-02-28', 'maintenance'),
  ('Northern Light', 'TB-004', 12, '2024-06-15', 'active');

INSERT INTO voyages (boat_id, origin_port_id, destination_port_id, departed_at, arrived_at, status, distance_nm) VALUES
  (1, 1, 2, '2026-07-01 08:00:00+00', '2026-07-02 14:30:00+00', 'completed', 178.4),
  (2, 2, 3, '2026-07-03 09:15:00+00', '2026-07-03 20:45:00+00', 'completed', 76.2),
  (1, 3, 4, '2026-07-05 07:30:00+00', NULL, 'underway', 412.8),
  (4, 5, 6, '2026-07-08 06:00:00+00', NULL, 'planned', 744.1),
  (3, 1, 5, '2026-06-20 10:00:00+00', '2026-06-24 18:00:00+00', 'completed', 678.9),
  (2, 4, 1, '2026-07-10 11:00:00+00', NULL, 'cancelled', 531.6);

INSERT INTO voyage_crew (voyage_id, crew_id, duty, boarded_at) VALUES
  (1, 1, 'captain', '2026-07-01 07:15:00+00'), (1, 2, 'oars', '2026-07-01 07:20:00+00'), (1, 3, 'navigation', '2026-07-01 07:10:00+00'),
  (2, 1, 'captain', '2026-07-03 08:30:00+00'), (2, 4, 'engine', '2026-07-03 08:35:00+00'), (2, 5, 'deck', '2026-07-03 08:40:00+00'),
  (3, 3, 'navigation', '2026-07-05 06:45:00+00'), (3, 6, 'medical', '2026-07-05 06:50:00+00'), (3, 8, 'supplies', '2026-07-05 06:40:00+00'),
  (4, 1, 'captain', '2026-07-08 05:15:00+00'), (4, 4, 'engine', '2026-07-08 05:20:00+00'), (4, 8, 'supplies', '2026-07-08 05:25:00+00'),
  (5, 2, 'oars', '2026-06-20 09:15:00+00'), (5, 7, 'oars', '2026-06-20 09:20:00+00');

INSERT INTO cargo_manifests (voyage_id, description, weight_kg, hazardous, declared_at) VALUES
  (1, 'Olive oil barrels', 840.50, false, '2026-06-30 15:00:00+00'),
  (1, 'Navigation charts', 18.20, false, '2026-06-30 15:05:00+00'),
  (2, 'Galician textiles', 312.00, false, '2026-07-02 13:00:00+00'),
  (3, 'Marine radio batteries', 95.00, true, '2026-07-04 16:30:00+00'),
  (4, 'Cold-weather provisions', 1260.75, false, '2026-07-07 12:00:00+00'),
  (5, 'Cork stoppers', 455.20, false, '2026-06-19 10:00:00+00');

INSERT INTO maintenance_logs (boat_id, logged_by_crew_id, category, notes, logged_at, resolved_at) VALUES
  (1, 4, 'engine', 'Replaced port-side cooling hose', '2026-06-25 09:00:00+00', '2026-06-25 12:00:00+00'),
  (2, 4, 'hull', 'Inspect minor scrape near stern', '2026-07-04 15:00:00+00', NULL),
  (3, 1, 'rigging', 'Annual rigging inspection underway', '2026-07-01 08:00:00+00', NULL),
  (4, 4, 'engine', 'Pre-departure diagnostics complete', '2026-07-07 14:00:00+00', '2026-07-07 16:00:00+00');
