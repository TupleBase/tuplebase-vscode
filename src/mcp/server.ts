import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { parseConfig, type TupleBaseConfig } from '../core/config'
import { loadFactories } from '../adapters/registry'
import { envSecretSource } from './secrets'
import { McpService } from './service'
import { version } from '../../package.json'

// stdout is the MCP transport — everything else goes to stderr
const log = (msg: string) => process.stderr.write(`[tuplebase-mcp] ${msg}\n`)

function loadConfig(): { config: TupleBaseConfig; baseDir: string } {
  const explicit = process.env.TUPLEBASE_CONFIG ?? process.argv[2]
  const path = explicit ? resolve(explicit) : resolve('.tuplebase.json')
  const baseDir = dirname(path)
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    log(`no config at ${path} — starting with no connections (set TUPLEBASE_CONFIG)`)
    return { config: { version: 1, groups: [], connections: {} }, baseDir }
  }
  const { config, errors } = parseConfig(text)
  for (const e of errors) log(`config: ${e.path}: ${e.message}`)
  return { config: config ?? { version: 1, groups: [], connections: {} }, baseDir }
}

const asText = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] })
const asError = (e: unknown) => ({
  content: [{ type: 'text' as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
  isError: true,
})

async function main() {
  const allowWrites = /^(1|true|yes)$/i.test(process.env.TUPLEBASE_MCP_ALLOW_WRITES ?? '')
  const maxRows = Number(process.env.TUPLEBASE_MCP_MAX_ROWS) || undefined
  const { config, baseDir } = loadConfig()
  const service = new McpService(config, await loadFactories(), envSecretSource(), { allowWrites, maxRows, baseDir })

  const server = new McpServer({ name: 'tuplebase', version })

  server.registerTool('list_connections', {
    title: 'List connections',
    description: 'List the databases configured in .tuplebase.json (name, group, adapter type, whether writes are allowed, whether it tunnels over SSH).',
    inputSchema: {},
  }, async () => asText(service.listConnections()))

  server.registerTool('inspect_schema', {
    title: 'Inspect schema',
    description: 'Browse a connection\'s schema tree. Omit nodeId for the top level (postgres schemas / dynamo tables / redis key namespaces); pass a node\'s id and kind from a previous result to drill in.',
    inputSchema: {
      connection: z.string().describe('connection name from list_connections'),
      nodeId: z.string().optional().describe('id of a node from a previous inspect_schema result'),
      kind: z.string().optional().describe('kind of that node (e.g. schema, table, namespace)'),
    },
  }, async ({ connection, nodeId, kind }) => {
    try { return asText(await service.inspectSchema(connection, nodeId, kind)) } catch (e) { return asError(e) }
  })

  server.registerTool('run_query', {
    title: 'Run a query',
    description: 'Run one statement against a connection: SQL (postgres), PartiQL (dynamodb) or a single command (redis). Read-only by default — writes are blocked unless the server was started with writes enabled.',
    inputSchema: {
      connection: z.string().describe('connection name from list_connections'),
      statement: z.string().describe('a single SQL/PartiQL statement or redis command'),
    },
  }, async ({ connection, statement }) => {
    try { return asText(await service.runQuery(connection, statement)) } catch (e) { return asError(e) }
  })

  const shutdown = () => { void service.dispose().finally(() => process.exit(0)) }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  await server.connect(new StdioServerTransport())
  log(`ready — ${service.listConnections().length} connection(s)${allowWrites ? ' (writes enabled)' : ' (read-only)'}`)
}

main().catch(e => { log(`fatal: ${e instanceof Error ? e.message : String(e)}`); process.exit(1) })
