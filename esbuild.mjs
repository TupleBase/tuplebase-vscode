import * as esbuild from 'esbuild'
import { cpSync, mkdirSync, readdirSync } from 'node:fs'

const watch = process.argv.includes('--watch')

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

if (watch) {
  const ctxs = await Promise.all([esbuild.context(host), esbuild.context(webview), esbuild.context(smokeTest)])
  await Promise.all(ctxs.map(c => c.watch()))
} else {
  await Promise.all([esbuild.build(host), esbuild.build(webview), esbuild.build(smokeTest)])
}
