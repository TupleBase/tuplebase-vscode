import type { AdapterFactory, AdapterModule, AdapterPresentation } from './types'
import { postgres } from './postgres'
import { redis } from './redis'
import { dynamodb } from './dynamodb'

// ── The one place a new database is registered ───────────────────────────────
// Drop a folder under src/adapters/<db>/ exporting an AdapterModule, then add it
// to this array. Only the (eager, data-only) presentations load at activation;
// each adapter's factory and completion load lazily on first use. Config
// validation, the JSON schema, the connection form, tree icons, completion and
// the connection manager all read from here.
export const ADAPTERS: AdapterModule[] = [postgres, redis, dynamodb]

export const adapterById: ReadonlyMap<string, AdapterModule> =
  new Map(ADAPTERS.map(m => [m.presentation.id, m]))

export const adapterIds: string[] = ADAPTERS.map(m => m.presentation.id)

export const presentations = (): AdapterPresentation[] => ADAPTERS.map(m => m.presentation)

export const presentationOf = (id: string): AdapterPresentation | undefined =>
  adapterById.get(id)?.presentation

// Load every adapter's factory (used by the standalone MCP server, which resolves
// connections on demand in a dedicated process).
export async function loadFactories(): Promise<Map<string, AdapterFactory>> {
  const entries = await Promise.all(
    ADAPTERS.map(async m => [m.presentation.id, await m.loadFactory()] as const),
  )
  return new Map(entries)
}
