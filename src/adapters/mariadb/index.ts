// Lazily-loaded chunk → dist/adapters/mariadb/index.js. MariaDB speaks the
// MySQL wire protocol, so this chunk is the mysql factory under the mariadb id.
export { mysqlFactory as factory } from '../mysql/adapter'
export { postgresCompletion as completion } from '../postgres/completion'
