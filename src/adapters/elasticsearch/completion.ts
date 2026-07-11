import type { CompletionContext, CompletionContribution, CompletionResult } from '../types'

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'HEAD']
const ENDPOINTS = ['_search', '_doc', '_mapping', '_count', '_bulk', '_cat/indices', '_cluster/health']

export const elasticsearchCompletion: CompletionContribution = {
  async provide(ctx: CompletionContext): Promise<CompletionResult[]> {
    if (!ctx.connected) return []
    const lp = ctx.linePrefix
    // start of a request line → HTTP methods
    if (/^\s*\w*$/.test(lp)) {
      const p = lp.trim().toUpperCase()
      return METHODS.filter(m => m.startsWith(p)).map((label): CompletionResult => ({ label, insertText: label, kind: 'keyword' }))
    }
    // METHOD <path fragment> → index names + common endpoints
    const pathCtx = /(?:GET|POST|PUT|DELETE|HEAD)\s+\/?([\w.*-]*)$/i.exec(lp)
    if (pathCtx) {
      const indexes = (await ctx.search('table', pathCtx[1])).map((t): CompletionResult => ({ label: t.name, insertText: t.name, kind: 'table' }))
      const endpoints = ENDPOINTS
        .filter(e => e.startsWith(pathCtx[1]))
        .map((e): CompletionResult => ({ label: e, insertText: e, kind: 'keyword' }))
      return [...indexes, ...endpoints]
    }
    return []
  },
}
