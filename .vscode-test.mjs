import { defineConfig } from '@vscode/test-cli'
export default defineConfig({
  files: 'dist/test/smoke.test.js',
  workspaceFolder: '.',
})
