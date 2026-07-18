-- Seed for the dev SQLite demo file. Built into demo.sqlite by `npm run db:seed -- sqlite`
-- (dev/seed/sqlite/seed.mjs runs it through sql.js — no sqlite3 CLI required).
create table ports (
  id integer primary key,
  code text not null,
  name text not null,
  country text
);

create table crew (
  id integer primary key,
  name text not null,
  role text not null,
  home_port_id integer references ports(id),
  meta text
);

insert into ports (id, code, name, country) values
  (1, 'LIS', 'Lisbon', 'Portugal'),
  (2, 'SDR', 'Santander', 'Spain'),
  (3, 'BRE', 'Bremen', 'Germany');

insert into crew (id, name, role, home_port_id, meta) values
  (1, 'ada', 'captain', 1, '{"rank": 1}'),
  (2, 'grace', 'navigator', 2, null),
  (3, 'hedy', 'engineer', 3, '{"rank": 3}');
