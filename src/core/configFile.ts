import { CONFIG_FILENAME } from './product'

export const CONFIG_FILENAMES = [CONFIG_FILENAME] as const

export function selectConfigFilename(existing: Iterable<string>): string | undefined {
  const names = new Set(existing)
  return CONFIG_FILENAMES.find(name => names.has(name))
}
