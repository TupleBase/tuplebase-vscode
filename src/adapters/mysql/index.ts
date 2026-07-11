// Lazily-loaded chunk → dist/adapters/mysql/index.js. MySQL speaks the same SQL
// dialect as postgres, so it reuses the shared SQL completion provider.
export { mysqlFactory as factory } from './adapter'
export { postgresCompletion as completion } from '../postgres/completion'
