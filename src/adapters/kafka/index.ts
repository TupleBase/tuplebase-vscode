// Lazily-loaded chunk → dist/adapters/kafka/index.js. Kafka isn't a database — the
// command surface (topics / describe / consume) gets its own completion.
export { kafkaFactory as factory } from './adapter'
export { kafkaCompletion as completion } from './completion'
