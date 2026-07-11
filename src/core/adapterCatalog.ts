// Host-side presentation lookups over the adapter registry. The tree uses the
// codicon; icon SVGs (when bundled) are resolved by the tree itself.
import { adapterById } from '../adapters/registry'

// Codicon id for a connection's type; falls back to a generic database icon.
export const adapterIcon = (adapter: string): string =>
  adapterById.get(adapter)?.presentation.codicon ?? 'database'
