import { Client, type ConnectConfig } from 'ssh2'
import { createServer, type Socket } from 'node:net'
import type { SshConfig } from '../adapters/types'

export interface TunnelSecrets {
  privateKey?: Buffer | string
  passphrase?: string
  password?: string
}

export interface Tunnel {
  host: string   // always 127.0.0.1
  port: number   // local port forwarded to the target through the bastion
  close(): Promise<void>
}

// ssh2 connect options from our config + resolved secrets. Exported for tests.
export function buildConnectConfig(ssh: SshConfig, secrets: TunnelSecrets): ConnectConfig {
  const cfg: ConnectConfig = {
    host: ssh.host,
    port: ssh.port ?? 22,
    username: ssh.user,
    readyTimeout: 15_000,
  }
  if (secrets.privateKey !== undefined) cfg.privateKey = secrets.privateKey
  if (secrets.passphrase !== undefined) cfg.passphrase = secrets.passphrase
  if (secrets.password !== undefined) cfg.password = secrets.password
  return cfg
}

// Open an SSH connection to the bastion and a local TCP listener that forwards
// each accepted socket to target host:port through it. The adapter then dials
// 127.0.0.1:<localPort> as if the database were local.
export function openTunnel(
  ssh: SshConfig,
  target: { host: string; port: number },
  secrets: TunnelSecrets,
  createClient: () => Client = () => new Client(),
): Promise<Tunnel> {
  return new Promise((resolve, reject) => {
    const conn = createClient()
    let settled = false
    const fail = (e: Error) => {
      if (settled) return
      settled = true
      conn.end()
      reject(e)
    }

    conn.on('error', err => fail(new Error(`SSH tunnel to ${ssh.host}:${ssh.port ?? 22}: ${err.message}`)))
    conn.on('ready', () => {
      const server = createServer((socket: Socket) => {
        conn.forwardOut('127.0.0.1', 0, target.host, target.port, (err, stream) => {
          if (err) { socket.destroy(); return }
          socket.pipe(stream).pipe(socket)
          const drop = () => { stream.destroy(); socket.destroy() }
          socket.on('error', drop)
          stream.on('error', drop)
        })
      })
      server.on('error', err => fail(new Error(`SSH tunnel local listener: ${err.message}`)))
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address()
        if (addr === null || typeof addr === 'string') { fail(new Error('SSH tunnel: could not open a local port')); return }
        settled = true
        resolve({
          host: '127.0.0.1',
          port: addr.port,
          close: () => new Promise<void>(res => server.close(() => { conn.end(); res() })),
        })
      })
    })
    conn.connect(buildConnectConfig(ssh, secrets))
  })
}
