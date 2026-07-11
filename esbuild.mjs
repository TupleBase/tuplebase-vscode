import * as esbuild from 'esbuild'
import { cpSync, mkdirSync } from 'node:fs'

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
  external: ['vscode', 'pg-native'],
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
}

const assetPlugin = { name: 'copy-assets', setup(b) { b.onEnd(copyAssets) } }
webview.plugins = [assetPlugin]

if (watch) {
  const ctxs = await Promise.all([esbuild.context(host), esbuild.context(webview), esbuild.context(smokeTest)])
  await Promise.all(ctxs.map(c => c.watch()))
} else {
  await Promise.all([esbuild.build(host), esbuild.build(webview), esbuild.build(smokeTest)])
}
