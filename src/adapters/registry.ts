import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type {
  AdapterFactory, AdapterModule, AdapterPresentation, CompletionContribution,
} from './types'
import { presentation as postgres } from './postgres/presentation'
import { presentation as mysql } from './mysql/presentation'
import { presentation as mariadb } from './mariadb/presentation'
import { presentation as sqlite } from './sqlite/presentation'
import { presentation as mssql } from './mssql/presentation'
import { presentation as clickhouse } from './clickhouse/presentation'
import { presentation as cassandra } from './cassandra/presentation'
import { presentation as neo4j } from './neo4j/presentation'
import { presentation as mongodb } from './mongodb/presentation'
import { presentation as elasticsearch } from './elasticsearch/presentation'
import { presentation as kafka } from './kafka/presentation'
import { presentation as redis } from './redis/presentation'
import { presentation as dynamodb } from './dynamodb/presentation'

// ── The one place a new database is registered ───────────────────────────────
// Drop a folder under src/adapters/<db>/ with a presentation.ts (eager data) and
// an index.ts chunk (factory + completion), then import its presentation here and
// add it to PRESENTATIONS. Only these presentations load at activation; each
// adapter's chunk (with its driver) loads lazily from dist/adapters/<id>/ the
// first time one of its connections is opened. Config validation, the JSON
// schema, the connection form, tree icons, completion and the connection manager
// all read from here.
const PRESENTATIONS: AdapterPresentation[] = [postgres, mysql, mariadb, sqlite, mssql, clickhouse, cassandra, neo4j, mongodb, elasticsearch, kafka, redis, dynamodb]

// ── Gradual rollout ──────────────────────────────────────────────────────────
// Adapters enabled in this release. Rollout is per-version: move an id into
// this list when its adapter is ready to ship. The rest stay registered but
// invisible — the list-shaped exports below return only enabled adapters, so
// the connection form, completion and the MCP server gate automatically, and
// the config loader skips entries referencing anything else. Lookups
// (adapterById, presentationOf) stay full: they only resolve ids that already
// passed the gate.
const ENABLED_ADAPTER_IDS = ['postgres', 'mysql', 'mariadb']

interface AdapterChunk { factory: AdapterFactory; completion?: CompletionContribution }

// Load an adapter's built chunk. It lives next to the running bundle
// (dist/adapters/<id>/ for the extension, dist/mcp/adapters/<id>/ for the MCP
// server), so __dirname resolves it for either entry point.
const loadChunk = (id: string): Promise<AdapterChunk> =>
  import(pathToFileURL(join(__dirname, 'adapters', id, 'index.js')).href) as Promise<AdapterChunk>

function toModule(presentation: AdapterPresentation): AdapterModule {
  return {
    presentation,
    loadFactory: () => loadChunk(presentation.id).then(m => m.factory),
    // an adapter contributes completion by declaring trigger characters
    ...(presentation.completionTriggers
      ? { loadCompletion: () => loadChunk(presentation.id).then(m => m.completion!) }
      : {}),
  }
}

const ALL_MODULES: AdapterModule[] = PRESENTATIONS.map(toModule)

export const ADAPTERS: AdapterModule[] = ALL_MODULES.filter(m => ENABLED_ADAPTER_IDS.includes(m.presentation.id))

export const adapterById: ReadonlyMap<string, AdapterModule> =
  new Map(ALL_MODULES.map(m => [m.presentation.id, m]))

export const adapterIds: string[] = ADAPTERS.map(m => m.presentation.id)

export const presentations = (): AdapterPresentation[] => ADAPTERS.map(m => m.presentation)

export const allPresentations = (): AdapterPresentation[] => PRESENTATIONS

export const presentationOf = (id: string): AdapterPresentation | undefined =>
  adapterById.get(id)?.presentation

// Load every enabled adapter's factory (used by the standalone MCP server, which
// resolves connections on demand in a dedicated process).
export async function loadFactories(): Promise<Map<string, AdapterFactory>> {
  const entries = await Promise.all(
    ADAPTERS.map(async m => [m.presentation.id, await m.loadFactory()] as const),
  )
  return new Map(entries)
}
