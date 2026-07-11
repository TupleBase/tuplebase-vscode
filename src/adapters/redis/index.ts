import type { AdapterModule } from '../types'
import { presentation } from './presentation'

export const redis: AdapterModule = {
  presentation,
  loadFactory: () => import('./adapter').then(m => m.redisFactory),
  loadCompletion: () => import('./completion').then(m => m.redisCompletion),
}
