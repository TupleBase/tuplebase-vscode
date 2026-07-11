// Lazily-loaded chunk → dist/adapters/neo4j/index.js. Neo4j speaks Cypher, so it
// ships its own completion (keywords + label/property lookups) rather than SQL's.
export { neo4jFactory as factory } from './adapter'
export { neo4jCompletion as completion } from './completion'
