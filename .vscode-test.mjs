import { defineConfig } from '@vscode/test-cli'
import { mkdirSync } from 'node:fs'

// empty workspace for the no-config (welcome view) scenario
mkdirSync('dev/empty-ws', { recursive: true })

export default defineConfig([
  {
    label: 'smoke',
    files: 'dist/test/smoke.test.js',
    workspaceFolder: '.',
  },
  {
    label: 'no-config',
    files: 'dist/test/noconfig.test.js',
    workspaceFolder: 'dev/empty-ws',
  },
])
