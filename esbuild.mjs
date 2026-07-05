import * as esbuild from 'esbuild'
import { cpSync, mkdirSync } from 'node:fs'

const watch = process.argv.includes('--watch')

const host = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  platform: 'node',
  format: 'cjs',
  external: ['vscode', 'pg-native'],
  sourcemap: true,
  minify: process.env.NODE_ENV === 'production',
}

const webview = {
  entryPoints: ['src/webview/results.ts'],
  bundle: true,
  outfile: 'dist/webview/results.js',
  platform: 'browser',
  format: 'iife',
  sourcemap: true,
  minify: process.env.NODE_ENV === 'production',
}

const copyAssets = () => {
  mkdirSync('dist/webview', { recursive: true })
  cpSync('node_modules/tabulator-tables/dist/css/tabulator.min.css', 'dist/webview/tabulator.min.css')
  cpSync('src/webview/results.css', 'dist/webview/results.css')
}

const assetPlugin = { name: 'copy-assets', setup(b) { b.onEnd(copyAssets) } }
webview.plugins = [assetPlugin]

if (watch) {
  const ctxs = await Promise.all([esbuild.context(host), esbuild.context(webview)])
  await Promise.all(ctxs.map(c => c.watch()))
} else {
  await Promise.all([esbuild.build(host), esbuild.build(webview)])
}
