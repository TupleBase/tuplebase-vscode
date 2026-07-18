import type { CompletionContext, CompletionContribution, CompletionResult } from '../types'

export const MONGO_METHODS = [
  'find', 'findOne', 'aggregate', 'count', 'distinct',
  'insertOne', 'insertMany', 'updateOne', 'updateMany', 'replaceOne', 'deleteOne', 'deleteMany',
]

export const mongodbCompletion: CompletionContribution = {
  async provide(ctx: CompletionContext): Promise<CompletionResult[]> {
    if (!ctx.connected) return []
    const lp = ctx.linePrefix
    // db.<collection>.<method — offer the supported methods
    const methodCtx = /db\.[\w$.-]+\.(\w*)$/.exec(lp)
    if (methodCtx) {
      const p = methodCtx[1].toLowerCase()
      return MONGO_METHODS.filter(m => m.toLowerCase().startsWith(p))
        .map((label): CompletionResult => ({ label, insertText: label, kind: 'function' }))
    }
    // db.<collection — offer collection names
    const collCtx = /db\.([\w$.-]*)$/.exec(lp)
    if (collCtx) {
      return (await ctx.search('table', collCtx[1]))
        .map((t): CompletionResult => ({ label: t.name, insertText: t.name, kind: 'table' }))
    }
    return []
  },
}
