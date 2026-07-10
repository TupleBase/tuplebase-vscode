import * as vscode from 'vscode'
import { parseConfig, RowboatConfig, ConfigError } from './config'
import type { ConnectionConfig } from '../adapters/types'

export class ConfigStore implements vscode.Disposable {
  private _config: RowboatConfig | undefined
  private _uri: vscode.Uri | undefined
  private emitter = new vscode.EventEmitter<void>()
  readonly onDidChange = this.emitter.event
  private watcher: vscode.FileSystemWatcher

  constructor(private diagnostics: vscode.DiagnosticCollection) {
    this.watcher = vscode.workspace.createFileSystemWatcher('**/.rowboat.json')
    this.watcher.onDidChange(() => this.load())
    this.watcher.onDidCreate(() => this.load())
    this.watcher.onDidDelete(() => this.load())
  }

  get config() { return this._config }
  get configUri() { return this._uri }

  async load(): Promise<void> {
    this._config = undefined
    this._uri = undefined
    const folder = vscode.workspace.workspaceFolders?.[0]
    if (folder) {
      const uri = vscode.Uri.joinPath(folder.uri, '.rowboat.json')
      try {
        const bytes = await vscode.workspace.fs.readFile(uri)
        this._uri = uri
        const { config, errors } = parseConfig(Buffer.from(bytes).toString('utf8'))
        this._config = config
        this.publishDiagnostics(uri, errors)
      } catch {
        // no config file — welcome view handles it
        this.diagnostics.clear()
      }
    }
    await vscode.commands.executeCommand('setContext', 'rowboat.hasConfig', !!this._config)
    this.emitter.fire()
  }

  environmentNames(): string[] {
    return Object.keys(this._config?.environments ?? {})
  }

  connections(env: string): ConnectionConfig[] {
    return Object.values(this._config?.environments[env] ?? {})
  }

  isReadonly(env: string): boolean {
    return this._config?.readonlyEnvironments[env] === true
  }

  private publishDiagnostics(uri: vscode.Uri, errors: ConfigError[]) {
    this.diagnostics.set(
      uri,
      errors.map(e => new vscode.Diagnostic(
        new vscode.Range(0, 0, 0, 1),
        e.path ? `${e.path}: ${e.message}` : e.message,
        vscode.DiagnosticSeverity.Error
      ))
    )
  }

  dispose() {
    this.watcher.dispose()
    this.emitter.dispose()
  }
}
