// Lazily-loaded chunk → dist/adapters/cassandra/index.js. CQL is close enough to
// SQL to reuse the shared SQL completion provider (keywords + schema lookups).
export { cassandraFactory as factory } from './adapter'
export { postgresCompletion as completion } from '../postgres/completion'
