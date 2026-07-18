// Emits schemas/tuplebase.schema.json from the adapter descriptors.
// Bundles the pure generator with esbuild (no driver code is pulled in — adapters
// load their drivers via dynamic import) and evaluates it in-process.
import * as esbuild from 'esbuild'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const { outputFiles } = await esbuild.build({
  entryPoints: [join(root, 'src/adapters/jsonSchema.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
})
const mod = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'))
const schema = mod.buildJsonSchema()

const out = join(root, 'schemas/tuplebase.schema.json')
writeFileSync(out, JSON.stringify(schema, null, 2) + '\n')
console.log(`wrote ${out} (${schema.definitions.connection.properties.adapter.enum.join(', ')})`)
