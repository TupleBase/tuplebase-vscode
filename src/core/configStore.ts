import * as vscode from 'vscode'
import { parseConfig, TupleBaseConfig, ConfigError } from './config'
import type { ConnectionConfig } from '../adapters/types'
import { selectConfigFilename } from './configFile'
import { BRAND, CONFIG_FILENAME, LEGACY_CONFIG_FILENAME } from './product'

export class ConfigStore implements vscode.Disposable {
  private _config: TupleBaseConfig | undefined
  private _uri: vscode.Uri | undefined
  private emitter = new vscode.EventEmitter<void>()
  readonly onDidChange = this.emitter.event
  private watchers: vscode.FileSystemWatcher[]
  private migrationOffered = false

  constructor(private diagnostics: vscode.DiagnosticCollection) {
    this.watchers = [CONFIG_FILENAME, LEGACY_CONFIG_FILENAME].map(filename => {
      const watcher = vscode.workspace.createFileSystemWatcher(`**/${filename}`)
      watcher.onDidChange(() => this.load())
      watcher.onDidCreate(() => this.load())
      watcher.onDidDelete(() => this.load())
      return watcher
    })
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
        if (filename === LEGACY_CONFIG_FILENAME) {
          void this.offerMigration(uri, vscode.Uri.joinPath(folder.uri, CONFIG_FILENAME))
        }
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

  private async offerMigration(from: vscode.Uri, to: vscode.Uri): Promise<void> {
    if (this.migrationOffered) return
    this.migrationOffered = true
    const action = `Rename to ${CONFIG_FILENAME}`
    const selected = await vscode.window.showInformationMessage(
      `${BRAND}: ${LEGACY_CONFIG_FILENAME} is deprecated. Rename it to ${CONFIG_FILENAME}?`,
      action,
    )
    if (selected !== action) return
    try {
      await vscode.workspace.fs.rename(from, to, { overwrite: false })
      await this.load()
    } catch (error) {
      void vscode.window.showErrorMessage(`${BRAND}: could not rename config: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  dispose() {
    for (const watcher of this.watchers) watcher.dispose()
    this.emitter.dispose()
  }
}
