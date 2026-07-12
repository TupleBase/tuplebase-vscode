#!/usr/bin/env node
// One entry point for the dev databases (wired to the npm `db:*` scripts):
//   node dev/db.mjs up <engine|all>        start container(s), then seed where scripted
//   node dev/db.mjs seed [engine...]       reseed running containers (default: every scripted seed)
//   node dev/db.mjs seed big [engine...]   opt-in high-volume paging data (postgres, redis, dynamo)
//   node dev/db.mjs down                   stop all containers
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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

// wait: pass --wait to `docker compose up` (needs the service's healthcheck to go green).
//   dynamo has no healthcheck and the elasticsearch seed retries — both skip it.
// seed: script-seeded engines. postgres/mysql/mariadb/clickhouse seed via the image
//   init hook instead — reseeding those needs a fresh volume (see DEVELOPMENT.md).
const ENGINES = {
  postgres:      { wait: false },
  mysql:         { wait: true },
  mariadb:       { wait: true },
  clickhouse:    { wait: true },
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

const BIG = {
  postgres: () => run('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'rowboat', '-d', 'rowboat'], readFileSync(join(seedDir, 'postgres', 'big.sql'), 'utf8')),
  redis:    () => redisCli(Array.from({ length: 5000 }, (_, i) => `SET pagedemo:${i + 1} value-${i + 1}`).join('\n')),
  dynamo:   () => nodeSeed('dynamo', 'big.mjs'),
};

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function seed(names, big) {
  const table = big
    ? BIG
    : Object.fromEntries(Object.entries(ENGINES).filter(([, e]) => e.seed).map(([n, e]) => [n, e.seed]));
  const targets = names.length ? names : Object.keys(table);
  for (const name of targets) {
    if (!table[name]) {
      if (!big && ENGINES[name]) fail(`${name} seeds via the image init hook — reseed with a fresh volume (see docs/DEVELOPMENT.md)`);
      fail(`unknown ${big ? 'big ' : ''}seed "${name}" (known: ${Object.keys(table).join(', ')})`);
    }
    console.log(`— seed ${name}${big ? ' (big)' : ''}`);
    table[name]();
  }
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'down') {
  compose('--profile', 'all', 'down');
} else if (cmd === 'up' && rest[0] === 'all') {
  compose('--profile', 'all', 'up', '-d', '--wait');
  seed([], false);
} else if (cmd === 'up' && ENGINES[rest[0]]) {
  const [name] = rest;
  const engine = ENGINES[name];
  if (engine.container !== false) compose('--profile', name, 'up', '-d', ...(engine.wait ? ['--wait'] : []));
  if (engine.seed) seed([name], false);
} else if (cmd === 'seed') {
  const big = rest[0] === 'big';
  seed(big ? rest.slice(1) : rest, big);
} else {
  fail(`usage: node dev/db.mjs up <engine|all> | seed [big] [engine...] | down\nengines: ${Object.keys(ENGINES).join(', ')}`);
}
