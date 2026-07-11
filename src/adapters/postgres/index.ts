// Lazily-loaded chunk (Rung 2): esbuild builds this entry — with the factory,
// completion and the pg driver — into dist/adapters/postgres/index.js. The core
// bundle loads it by path only when a postgres connection is opened, so the
// driver never sits in the activation path. The eager presentation lives in
// ./presentation and is imported by the registry directly.
export { postgresFactory as factory } from './adapter'
export { postgresCompletion as completion } from './completion'
