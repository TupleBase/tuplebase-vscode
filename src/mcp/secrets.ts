// Where the standalone MCP server gets connection secrets. Unlike the extension
// (VS Code SecretStorage), the server runs outside VS Code, so secrets arrive as
// environment variables — the "Show MCP Server Config" command populates them
// from the OS keychain when generating the client config.
export interface SecretSource {
  get(connName: string, field: string): string | undefined
}

// TUPLEBASE_SECRET_<CONN>_<FIELD>, non-alphanumerics collapsed to '_', uppercased.
export function secretEnvVar(connName: string, field: string): string {
  const norm = (s: string) => s.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()
  return `TUPLEBASE_SECRET_${norm(connName)}_${norm(field)}`
}

export function envSecretSource(env: Record<string, string | undefined> = process.env): SecretSource {
  return {
    get: (connName, field) => env[secretEnvVar(connName, field)],
  }
}
