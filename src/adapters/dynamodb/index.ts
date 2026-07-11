import type { AdapterModule } from '../types'
import { presentation } from './presentation'

export const dynamodb: AdapterModule = {
  presentation,
  loadFactory: () => import('./adapter').then(m => m.dynamodbFactory),
  loadCompletion: () => import('./completion').then(m => m.dynamodbCompletion),
}
