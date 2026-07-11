// Single source of per-adapter presentation: the tree uses `codicon`, the
// connection form uses `emoji`/`label`/`blurb`. Add a row here to onboard a new
// database type's look in one place.
export interface AdapterMeta {
  id: string
  label: string
  codicon: string
  emoji: string
  blurb: string
}

export const ADAPTER_CATALOG: Record<string, AdapterMeta> = {
  postgres: { id: 'postgres', label: 'PostgreSQL', codicon: 'database', emoji: '🐘', blurb: 'Relational · SQL' },
  redis: { id: 'redis', label: 'Redis', codicon: 'zap', emoji: '⚡', blurb: 'Key-value · commands' },
  dynamodb: { id: 'dynamodb', label: 'DynamoDB', codicon: 'cloud', emoji: '🟧', blurb: 'AWS · PartiQL' },
}

// Codicon id for a connection's type; falls back to a generic database icon.
export const adapterIcon = (adapter: string): string => ADAPTER_CATALOG[adapter]?.codicon ?? 'database'
