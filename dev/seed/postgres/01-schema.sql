CREATE TABLE crew (
  id serial PRIMARY KEY,
  name text NOT NULL,
  role text NOT NULL,
  joined date NOT NULL DEFAULT current_date
);

CREATE TABLE voyages (
  id serial PRIMARY KEY,
  crew_id int REFERENCES crew(id),
  destination text NOT NULL,
  departed_at timestamptz
);

INSERT INTO crew (name, role) VALUES
  ('ada', 'captain'), ('linus', 'rower'), ('grace', 'navigator');

INSERT INTO voyages (crew_id, destination, departed_at) VALUES
  (1, 'upstream', now() - interval '2 days'),
  (2, 'downstream', now() - interval '1 day'),
  (3, 'delta', NULL);
