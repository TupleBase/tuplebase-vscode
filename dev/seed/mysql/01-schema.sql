-- Seed for the dev MySQL container — piped in by dev/db.mjs (up / seed).
-- Idempotent: drops and recreates, so the same file reseeds a running container.
drop table if exists crew;

create table crew (
  id int primary key,
  name varchar(50) not null,
  role varchar(50) not null,
  meta json
);

insert into crew (id, name, role, meta) values
  (1, 'ada', 'captain', '{"rank": 1}'),
  (2, 'grace', 'navigator', null),
  (3, 'hedy', 'engineer', '{"rank": 3}');
