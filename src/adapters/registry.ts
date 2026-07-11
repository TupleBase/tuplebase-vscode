import type { AdapterDescriptor, AdapterFactory, AdapterPresentation } from './types'
import { postgres } from './postgres'
import { redis } from './redis'
import { dynamodb } from './dynamodb'

// ── The one place a new database is registered ───────────────────────────────
// Drop a folder under src/adapters/<db>/ exporting an AdapterDescriptor, then
// add it to this array. Config validation, the JSON schema, the connection form,
// tree icons, completion and the connection manager all read from here.
export const ADAPTERS: AdapterDescriptor[] = [postgres, redis, dynamodb]

export const adapterById: ReadonlyMap<string, AdapterDescriptor> =
  new Map(ADAPTERS.map(d => [d.presentation.id, d]))

export const adapterIds: string[] = ADAPTERS.map(d => d.presentation.id)

export const presentations = (): AdapterPresentation[] => ADAPTERS.map(d => d.presentation)

// fresh Map per call — ConnectionManager owns its own instance
export const adapterFactories = (): Map<string, AdapterFactory> =>
  new Map(ADAPTERS.map(d => [d.factory.id, d.factory]))
