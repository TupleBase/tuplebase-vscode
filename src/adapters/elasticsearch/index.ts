// Lazily-loaded chunk → dist/adapters/elasticsearch/index.js. Query DSL over HTTP,
// so it ships its own completion (HTTP methods + index names + common endpoints).
export { elasticsearchFactory as factory } from './adapter'
export { elasticsearchCompletion as completion } from './completion'
