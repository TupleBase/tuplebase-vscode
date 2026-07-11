-- Seed for the dev MySQL container (mounted at /docker-entrypoint-initdb.d).
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
