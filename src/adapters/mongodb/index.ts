// Lazily-loaded chunk → dist/adapters/mongodb/index.js. MongoDB uses MQL, so it
// ships its own completion (collection names + query methods).
export { mongodbFactory as factory } from './adapter'
export { mongodbCompletion as completion } from './completion'
