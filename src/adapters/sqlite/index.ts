// Lazily-loaded chunk → dist/adapters/sqlite/index.js. SQLite speaks the same SQL
// dialect as postgres, so it reuses the shared SQL completion provider.
export { sqliteFactory as factory } from './adapter'
export { postgresCompletion as completion } from '../postgres/completion'
