import type { CompletionContext, CompletionContribution, CompletionResult } from '../types'

const COMMANDS = ['topics', 'describe', 'consume']

export const kafkaCompletion: CompletionContribution = {
  async provide(ctx: CompletionContext): Promise<CompletionResult[]> {
    if (!ctx.connected) return []
    const lp = ctx.linePrefix
    // start of a line → commands
    if (/^\s*\w*$/.test(lp)) {
      const p = lp.trim().toLowerCase()
      return COMMANDS.filter(c => c.startsWith(p)).map((label): CompletionResult => ({ label, insertText: label, kind: 'keyword' }))
    }
    // describe/consume <topic — offer topic names
    const topicCtx = /(?:describe|consume|tail)\s+([\w.-]*)$/i.exec(lp)
    if (topicCtx) {
      return (await ctx.search('table', topicCtx[1]))
        .map((t): CompletionResult => ({ label: t.name, insertText: t.name, kind: 'table' }))
    }
    return []
  },
}
