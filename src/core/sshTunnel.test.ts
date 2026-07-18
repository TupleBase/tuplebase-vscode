import { describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'

// capture the server's connection handler so we can exercise forwardOut wiring
let connectionHandler: ((socket: unknown) => void) | undefined
let serverClosed = false
const fakeServer = {
  on() { return fakeServer },
  listen(_port: number, _host: string, cb: () => void) { queueMicrotask(cb) },
  address() { return { port: 54321 } },
  close(cb?: () => void) { serverClosed = true; cb?.() },
}
vi.mock('node:net', () => ({
  createServer: (handler: (socket: unknown) => void) => { connectionHandler = handler; return fakeServer },
}))
vi.mock('ssh2', () => ({ Client: class {} }))

import { buildConnectConfig, openTunnel } from './sshTunnel'

class FakeClient extends EventEmitter {
  connectArgs: unknown
  ended = false
  forwardArgs: { dstHost: string; dstPort: number } | undefined
  private readyMode: 'ready' | 'error'
  constructor(readyMode: 'ready' | 'error' = 'ready') { super(); this.readyMode = readyMode }
  connect(cfg: unknown) {
    this.connectArgs = cfg
    queueMicrotask(() => this.emit(this.readyMode, this.readyMode === 'error' ? new Error('auth failed') : undefined))
  }
  end() { this.ended = true }
  forwardOut(_sh: string, _sp: number, dstHost: string, dstPort: number, cb: (e: Error | undefined, s: unknown) => void) {
    this.forwardArgs = { dstHost, dstPort }
    cb(undefined, new EventEmitter())
  }
}

describe('buildConnectConfig', () => {
  it('defaults port to 22 and sets a ready timeout', () => {
    expect(buildConnectConfig({ host: 'b', user: 'u' }, {})).toEqual({
      host: 'b', port: 22, username: 'u', readyTimeout: 15_000,
    })
  })

  it('carries key, passphrase and password secrets through', () => {
    const key = Buffer.from('KEY')
    expect(buildConnectConfig({ host: 'b', port: 2222, user: 'u' }, { privateKey: key, passphrase: 'pp', password: 'pw' }))
      .toMatchObject({ port: 2222, privateKey: key, passphrase: 'pp', password: 'pw' })
  })
})

describe('openTunnel', () => {
  it('connects to the bastion, opens a local port, and forwards to the target', async () => {
    serverClosed = false
    const client = new FakeClient('ready')
    const tunnel = await openTunnel(
      { host: 'bastion', port: 2222, user: 'ec2' },
      { host: 'db.internal', port: 5432 },
      { password: 'pw' },
      () => client as never,
    )
    expect(tunnel.host).toBe('127.0.0.1')
    expect(tunnel.port).toBe(54321)
    expect(client.connectArgs).toMatchObject({ host: 'bastion', port: 2222, username: 'ec2', password: 'pw' })

    // a new local socket forwards to the target through the bastion
    const socket = Object.assign(new EventEmitter(), { pipe: () => socket, destroy() {} })
    connectionHandler?.(socket)
    expect(client.forwardArgs).toEqual({ dstHost: 'db.internal', dstPort: 5432 })

    await tunnel.close()
    expect(serverClosed).toBe(true)
    expect(client.ended).toBe(true)
  })

  it('rejects (and ends the client) when the SSH connection errors', async () => {
    const client = new FakeClient('error')
    await expect(
      openTunnel({ host: 'bastion', user: 'u' }, { host: 'db', port: 5432 }, {}, () => client as never),
    ).rejects.toThrow(/SSH tunnel to bastion:22: auth failed/)
    expect(client.ended).toBe(true)
  })
})
