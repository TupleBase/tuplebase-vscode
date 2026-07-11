// Lazily-loaded chunk → dist/adapters/clickhouse/index.js. ClickHouse speaks a
// SQL dialect close to postgres, so it reuses the shared SQL completion provider.
export { clickhouseFactory as factory } from './adapter'
export { postgresCompletion as completion } from '../postgres/completion'
