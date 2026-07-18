import * as vscode from 'vscode'
import { parseConfig, TupleBaseConfig, ConfigError } from './config'
import type { ConnectionConfig } from '../adapters/types'
import { selectConfigFilename } from './configFile'
import { CONFIG_FILENAME } from './product'

export class ConfigStore implements vscode.Disposable {
  private _config: TupleBaseConfig | undefined
  private _uri: vscode.Uri | undefined
  private emitter = new vscode.EventEmitter<void>()
  readonly onDidChange = this.emitter.event
  private watcher: vscode.FileSystemWatcher

  constructor(private diagnostics: vscode.DiagnosticCollection) {
    this.watcher = vscode.workspace.createFileSystemWatcher(`**/${CONFIG_FILENAME}`)
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
      try {
        const entries = await vscode.workspace.fs.readDirectory(folder.uri)
        const filename = selectConfigFilename(entries.map(([name]) => name))
        if (!filename) throw new Error('no config file')
        const uri = vscode.Uri.joinPath(folder.uri, filename)
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
    await vscode.commands.executeCommand('setContext', 'tuplebase.hasConfig', !!this._config)
    this.emitter.fire()
  }

  groupNames(): string[] {
    return this._config?.groups ?? []
  }

  connections(): ConnectionConfig[] {
    return Object.values(this._config?.connections ?? {})
  }

  connectionsByGroup(group: string): ConnectionConfig[] {
    return this.connections().filter(c => c.group === group)
  }

  connection(name: string): ConnectionConfig | undefined {
    return this._config?.connections[name]
  }

  isReadonly(name: string): boolean {
    return this._config?.connections[name]?.readonly === true
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
