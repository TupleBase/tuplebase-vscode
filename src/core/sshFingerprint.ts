import { createHash, timingSafeEqual } from 'node:crypto'

const SHA256_PREFIX = 'SHA256:'

export function normalizeSshFingerprint(value: string): string | undefined {
  if (!value.startsWith(SHA256_PREFIX)) return undefined
  const digest = value.slice(SHA256_PREFIX.length).replace(/=+$/, '')
  if (!/^[A-Za-z0-9+/]{43}$/.test(digest)) return undefined
  if (Buffer.from(digest, 'base64').length !== 32) return undefined
  return `${SHA256_PREFIX}${digest}`
}

export function sshHostFingerprint(key: Buffer): string {
  const digest = createHash('sha256').update(key).digest('base64').replace(/=+$/, '')
  return `${SHA256_PREFIX}${digest}`
}

export function matchesSshHostFingerprint(expected: string, key: Buffer): boolean {
  const normalized = normalizeSshFingerprint(expected)
  if (!normalized) return false
  const actual = Buffer.from(sshHostFingerprint(key))
  const wanted = Buffer.from(normalized)
  return actual.length === wanted.length && timingSafeEqual(actual, wanted)
}
