import * as esbuild from 'esbuild'
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs'

const watch = process.argv.includes('--watch')

// Per-adapter chunk entries: src/adapters/<id>/index.ts → <outdir>/<id>/index.js
const adapterEntries = readdirSync('src/adapters', { withFileTypes: true })
  .filter(e => e.isDirectory() && existsSync(`src/adapters/${e.name}/index.ts`))
  .map(e => `src/adapters/${e.name}/index.ts`)

const host = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  platform: 'node',
  format: 'cjs',
  // jsonc-parser's CJS/UMD build calls require() through a factory parameter,
  // which esbuild can't statically resolve when bundled — pick its ESM build instead.
  mainFields: ['module', 'main'],
  // ssh2 optionally require()s native .node bindings (sshcrypto, cpu-features) in
  // try/catch and falls back to pure JS; keep them external so the bundle builds.
  external: ['vscode', 'pg-native', 'cpu-features', '*.node'],
  sourcemap: true,
  minify: process.env.NODE_ENV === 'production',
}

const webview = {
  entryPoints: ['src/webview/results.ts', 'src/webview/connForm.ts'],
  bundle: true,
  outdir: 'dist/webview',
  platform: 'browser',
  format: 'iife',
  sourcemap: true,
  minify: process.env.NODE_ENV === 'production',
}

const smokeTest = {
  ...host,
  entryPoints: ['src/test/smoke.test.ts', 'src/test/noconfig.test.ts'],
  outfile: undefined,
  outdir: 'dist/test',
  external: [...host.external, 'mocha'],
}

// Standalone MCP server. No 'vscode' in externals — the build fails if anything
// in this graph imports the extension host, keeping it a plain node process.
const mcp = {
  ...host,
  entryPoints: ['src/mcp/server.ts'],
  outfile: 'dist/mcp/server.js',
  external: ['pg-native', 'cpu-features', '*.node'],
}

// Rung 2: each adapter (factory + completion + driver) builds into its own chunk,
// loaded by the core/MCP bundle at runtime from <bundle-dir>/adapters/<id>/. Built
// next to both entry points so __dirname resolves it either way.
const adapterChunks = outdir => ({
  ...host,
  entryPoints: adapterEntries,
  outbase: 'src/adapters',
  outfile: undefined,
  outdir,
  external: ['pg-native', 'cpu-features', '*.node'],
})

const copyAssets = () => {
  mkdirSync('dist/webview', { recursive: true })
  cpSync('node_modules/tabulator-tables/dist/css/tabulator.min.css', 'dist/webview/tabulator.min.css')
  cpSync('src/webview/results.css', 'dist/webview/results.css')
  cpSync('src/webview/connForm.css', 'dist/webview/connForm.css')
  // per-adapter icon SVGs → dist/adapters/<id>/ (resolved by the schema tree)
  for (const entry of readdirSync('src/adapters', { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const dir = `src/adapters/${entry.name}`
    const svgs = readdirSync(dir).filter(f => f.endsWith('.svg'))
    if (svgs.length === 0) continue
    mkdirSync(`dist/adapters/${entry.name}`, { recursive: true })
    for (const f of svgs) cpSync(`${dir}/${f}`, `dist/adapters/${entry.name}/${f}`)
  }
}

const assetPlugin = { name: 'copy-assets', setup(b) { b.onEnd(copyAssets) } }
webview.plugins = [assetPlugin]

const configs = [
  host, webview, smokeTest, mcp,
  adapterChunks('dist/adapters'),      // loaded by dist/extension.js
  adapterChunks('dist/mcp/adapters'),  // loaded by dist/mcp/server.js
]

if (watch) {
  const ctxs = await Promise.all(configs.map(c => esbuild.context(c)))
  await Promise.all(ctxs.map(c => c.watch()))
} else {
  await Promise.all(configs.map(c => esbuild.build(c)))
}
