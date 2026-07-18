#!/usr/bin/env node
// One entry point for the dev databases (wired to the npm `db:*` scripts):
//   node dev/db.mjs start <engine|all>     start container(s) — never touches existing data
//   node dev/db.mjs seed [engine...]       (re)seed running containers, incl. the high-volume
//                                          paging data (default: every engine)
//   node dev/db.mjs down                   stop all containers
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const seedDir = join(dirname(fileURLToPath(import.meta.url)), 'seed');
const root = join(seedDir, '..', '..');

function run(cmd, args, input) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    input,
    stdio: [input === undefined ? 'inherit' : 'pipe', 'inherit', 'inherit'],
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
const compose = (...args) => run('docker', ['compose', ...args]);
const nodeSeed = (engine, file = 'seed.mjs') => run(process.execPath, [join(seedDir, engine, file)]);
const redisCli = (input) => run('docker', ['compose', 'exec', '-T', 'redis', 'redis-cli'], input);
const pipeSql = (service, cli, file) => run('docker', ['compose', 'exec', '-T', service, ...cli], readFileSync(join(seedDir, service, file), 'utf8'));

// wait: pass --wait to `docker compose up` (needs the service's healthcheck to go green).
//   dynamo has no healthcheck and the elasticsearch seed retries — both skip it.
// seed: every engine reseeds in place against the running container (seed files
//   drop and recreate); sqlite has no container — its seed builds the demo file.
const ENGINES = {
  postgres:      { wait: true,  seed: () => pipeSql('postgres', ['psql', '-U', 'tuplebase', '-d', 'tuplebase'], '01-schema.sql') },
  mysql:         { wait: true,  seed: () => pipeSql('mysql', ['mysql', '-utuplebase', '-ptuplebase', 'tuplebase'], '01-schema.sql') },
  mariadb:       { wait: true,  seed: () => pipeSql('mariadb', ['mariadb', '-utuplebase', '-ptuplebase', 'tuplebase'], '01-schema.sql') },
  clickhouse:    { wait: true,  seed: () => pipeSql('clickhouse', ['clickhouse-client', '-d', 'tuplebase'], '01-schema.sql') },
  sqlite:        { container: false, seed: () => nodeSeed('sqlite') },
  redis:         { wait: true,  seed: () => redisCli(readFileSync(join(seedDir, 'redis', 'seed.redis'), 'utf8').split('\n').filter((l) => !l.startsWith('#')).join('\n')) },
  dynamo:        { wait: false, seed: () => nodeSeed('dynamo') },
  mssql:         { wait: true,  seed: () => nodeSeed('mssql') },
  cassandra:     { wait: true,  seed: () => nodeSeed('cassandra') },
  neo4j:         { wait: true,  seed: () => nodeSeed('neo4j') },
  mongodb:       { wait: true,  seed: () => nodeSeed('mongodb') },
  elasticsearch: { wait: false, seed: () => nodeSeed('elasticsearch') },
  kafka:         { wait: true,  seed: () => nodeSeed('kafka') },
};

// High-volume paging datasets (dev/seed/<engine>/big.*) — run as the second
// half of every seed, right after the engine's base seed.
const BIG = {
  postgres:      () => pipeSql('postgres', ['psql', '-U', 'tuplebase', '-d', 'tuplebase'], 'big.sql'),
  mysql:         () => pipeSql('mysql', ['mysql', '-utuplebase', '-ptuplebase', 'tuplebase'], 'big.sql'),
  mariadb:       () => pipeSql('mariadb', ['mariadb', '-utuplebase', '-ptuplebase', 'tuplebase'], 'big.sql'),
  clickhouse:    () => pipeSql('clickhouse', ['clickhouse-client', '-d', 'tuplebase'], 'big.sql'),
  sqlite:        () => nodeSeed('sqlite', 'big.mjs'),
  redis:         () => redisCli(Array.from({ length: 5000 }, (_, i) => `SET pagedemo:${i + 1} value-${i + 1}`).join('\n')),
  dynamo:        () => nodeSeed('dynamo', 'big.mjs'),
  mssql:         () => nodeSeed('mssql', 'big.mjs'),
  cassandra:     () => nodeSeed('cassandra', 'big.mjs'),
  neo4j:         () => nodeSeed('neo4j', 'big.mjs'),
  mongodb:       () => nodeSeed('mongodb', 'big.mjs'),
  elasticsearch: () => nodeSeed('elasticsearch', 'big.mjs'),
  kafka:         () => nodeSeed('kafka', 'big.mjs'),
};

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function seed(names) {
  const targets = names.length ? names : Object.keys(ENGINES);
  for (const name of targets) {
    if (!ENGINES[name]) fail(`unknown seed "${name}" (known: ${Object.keys(ENGINES).join(', ')})`);
    console.log(`— seed ${name}`);
    ENGINES[name].seed();
    BIG[name]();
  }
}

// sqlite has no container — "starting" it just means the demo file exists.
const ensureSqlite = () => {
  if (!existsSync(join(seedDir, 'sqlite', 'demo.sqlite'))) seed(['sqlite']);
};

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'down') {
  compose('--profile', 'all', 'down');
} else if (cmd === 'start' && rest[0] === 'all') {
  compose('--profile', 'all', 'up', '-d', '--wait');
  ensureSqlite();
} else if (cmd === 'start' && ENGINES[rest[0]]) {
  const [name] = rest;
  const engine = ENGINES[name];
  if (engine.container !== false) compose('--profile', name, 'up', '-d', ...(engine.wait ? ['--wait'] : []));
  else ensureSqlite();
} else if (cmd === 'seed') {
  seed(rest);
} else {
  fail(`usage: node dev/db.mjs start <engine|all> | seed [engine...] | down\nengines: ${Object.keys(ENGINES).join(', ')}`);
}
