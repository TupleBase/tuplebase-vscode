import { CONFIG_FILENAME, LEGACY_CONFIG_FILENAME } from './product'

export const CONFIG_FILENAMES = [CONFIG_FILENAME, LEGACY_CONFIG_FILENAME] as const

// Prefer the current config when both exist. The legacy filename remains
// readable for the pre-release migration window, but is never created.
export function selectConfigFilename(existing: Iterable<string>): string | undefined {
  const names = new Set(existing)
  return CONFIG_FILENAMES.find(name => names.has(name))
}
