// Lazily-loaded chunk → dist/adapters/mssql/index.js. T-SQL is close enough to the
// shared SQL dialect to reuse the postgres completion provider.
export { mssqlFactory as factory } from './adapter'
export { postgresCompletion as completion } from '../postgres/completion'
