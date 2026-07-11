import * as vscode from 'vscode'
import type { CompletionContext, CompletionContribution, CompletionResult } from '../adapters/types'
import { ADAPTERS, adapterById } from '../adapters/registry'
import { ConnectionManager } from '../core/connections'
import { ConfigStore } from '../core/configStore'
import { getFileConnection } from '../core/fileConn'

const KIND: Record<CompletionResult['kind'], vscode.CompletionItemKind> = {
  keyword: vscode.CompletionItemKind.Keyword,
  function: vscode.CompletionItemKind.Function,
  table: vscode.CompletionItemKind.Struct,
  column: vscode.CompletionItemKind.Field,
  key: vscode.CompletionItemKind.Value,
  value: vscode.CompletionItemKind.Value,
}

function toItem(r: CompletionResult, position: vscode.Position): vscode.CompletionItem {
  const item = new vscode.CompletionItem(r.label, KIND[r.kind])
  item.insertText = r.insertText
  if (r.detail) item.detail = r.detail
  if (r.documentation) item.documentation = r.documentation
  if (r.replaceFromChar !== undefined) {
    // replace the whole typed token (redis keys contain ':', which splits the default word range)
    item.range = new vscode.Range(position.line, r.replaceFromChar, position.line, position.character)
  }
  return item
}

// One vscode completion provider per query language, dispatching to the adapter
// bound to the file's connection — so postgres SQL and DynamoDB PartiQL share the
// 'sql' language yet get their own completions. Trigger characters come from the
// eager presentation; the provider itself loads lazily (and is cached) on first
// use. Registering a new database's completion needs only its module.
export function registerCompletions(
  manager: ConnectionManager,
  store: ConfigStore,
  workspaceState: vscode.Memento,
): vscode.Disposable {
  const triggersByLang = new Map<string, Set<string>>()
  for (const m of ADAPTERS) {
    if (!m.loadCompletion) continue
    const set = triggersByLang.get(m.presentation.languageId) ?? new Set<string>()
    for (const t of m.presentation.completionTriggers ?? []) set.add(t)
    triggersByLang.set(m.presentation.languageId, set)
  }

  const loaded = new Map<string, CompletionContribution>()
  const loadCompletion = async (adapterId: string): Promise<CompletionContribution | undefined> => {
    const cached = loaded.get(adapterId)
    if (cached) return cached
    const contribution = await adapterById.get(adapterId)?.loadCompletion?.()
    if (contribution) loaded.set(adapterId, contribution)
    return contribution
  }

  const disposables: vscode.Disposable[] = []
  for (const [languageId, triggers] of triggersByLang) {
    const provider: vscode.CompletionItemProvider = {
      async provideCompletionItems(doc, position) {
        const connName = getFileConnection(workspaceState, doc.uri.fsPath)
        if (!connName) return []
        const cfg = store.connection(connName)
        if (!cfg) return []
        const module = adapterById.get(cfg.adapter)
        if (!module?.loadCompletion || module.presentation.languageId !== languageId) return []
        const adapter = manager.liveAdapter(connName)
        const ctx: CompletionContext = {
          languageId,
          fullText: doc.getText(),
          offset: doc.offsetAt(position),
          line: position.line,
          character: position.character,
          linePrefix: doc.lineAt(position.line).text.slice(0, position.character),
          connected: adapter !== undefined,
          // ponytail: searchItems hits the live server per completion (pg queries
          // information_schema, dynamo lists/describes, redis SCANs; all capped) —
          // add a short-TTL cache keyed by (conn, kind, prefix) if it ever lags
          search: async (kind, prefix) => {
            if (!adapter) return []
            try { return await adapter.searchItems(kind, prefix) } catch { return [] }
          },
        }
        const contribution = await loadCompletion(cfg.adapter)
        if (!contribution) return []
        const results = await contribution.provide(ctx)
        return results.map(r => toItem(r, position))
      },
    }
    disposables.push(vscode.languages.registerCompletionItemProvider(languageId, provider, ...triggers))
  }
  return vscode.Disposable.from(...disposables)
}
