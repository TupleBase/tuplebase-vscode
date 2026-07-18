// sql.js ships a pure-JS (asm.js) build alongside the default wasm one. We load
// the asm build so the adapter chunk is fully self-contained — no .wasm asset to
// resolve at runtime — and works identically under Node, the VS Code extension
// host (Electron) and the standalone MCP server without any native rebuild.
// @types/sql.js only declares the package root, so declare the subpath here.
declare module 'sql.js/dist/sql-asm.js' {
  const initSqlJs: (config?: unknown) => Promise<import('sql.js').SqlJsStatic>
  export default initSqlJs
}
