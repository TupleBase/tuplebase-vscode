import type { AdapterModule } from '../types'
import { presentation } from './presentation'

// Presentation is eager; the factory (which pulls in the pg driver) and the
// completion provider load only when a postgres connection is opened / a postgres
// file is edited. Register by adding this to src/adapters/registry.ts.
export const postgres: AdapterModule = {
  presentation,
  loadFactory: () => import('./adapter').then(m => m.postgresFactory),
  loadCompletion: () => import('./completion').then(m => m.postgresCompletion),
}
