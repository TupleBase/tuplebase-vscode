import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'))
const normalizeText = text => text
  .replace(/\r\n?/g, '\n')
  .replace(/[ \t]+$/gm, '')
  .trim()

const mitLicense = holder => `MIT License

Copyright (c) ${holder}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`

const fallbackCopyright = new Map([
  ['@redis/client', '2022-2023, Redis, Inc.'],
  ['pg-types', 'Brian M. Carlson'],
  ['pgpass', 'Hannes Hörl'],
  ['punycode', 'Mathias Bynens'],
])

const sourceUrl = manifest => {
  const repository = typeof manifest.repository === 'string'
    ? manifest.repository
    : manifest.repository?.url
  if (!repository) return manifest.homepage
  return repository
    .replace(/^git\+/, '')
    .replace(/^git:\/\/github\.com\//, 'https://github.com/')
    .replace(/^github:/, 'https://github.com/')
    .replace(/\.git$/, '')
}

const noticeFilenames = dir => readdirSync(dir)
  .filter(name => /^(licen[sc]e|copying|notice)(\..*)?$/i.test(name))
  .filter(name => statSync(join(dir, name)).isFile())
  .sort((a, b) => a.localeCompare(b))

const apacheLicense = normalizeText(readFileSync(join(root, 'node_modules/@aws-sdk/client-dynamodb/LICENSE'), 'utf8'))
const components = new Map()

for (const [relativePath, locked] of Object.entries(lock.packages ?? {})) {
  if (!relativePath.startsWith('node_modules/') || locked.dev) continue

  const dir = join(root, relativePath)
  const manifestPath = join(dir, 'package.json')
  if (!existsSync(manifestPath)) continue

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const key = `${manifest.name}@${manifest.version}`
  if (components.has(key)) continue

  const files = noticeFilenames(dir)
  let notices = files.map(name => ({
    name,
    text: normalizeText(readFileSync(join(dir, name), 'utf8')),
  }))

  if (notices.length === 0 && manifest.license === 'Apache-2.0') {
    notices = [{ name: 'Apache License 2.0', text: apacheLicense }]
  } else if (notices.length === 0 && manifest.license === 'MIT') {
    const holder = fallbackCopyright.get(manifest.name)
    if (!holder) throw new Error(`No license text or fallback attribution for ${key}`)
    notices = [{ name: 'MIT License', text: mitLicense(holder) }]
  } else if (notices.length === 0) {
    throw new Error(`No license text for ${key} (${manifest.license ?? locked.license ?? 'unknown license'})`)
  }

  components.set(key, {
    name: manifest.name,
    version: manifest.version,
    license: manifest.license ?? locked.license ?? 'See included license text',
    source: sourceUrl(manifest),
    notices,
  })
}

const sorted = [...components.values()].sort((a, b) =>
  a.name.localeCompare(b.name) || a.version.localeCompare(b.version)
)

const inventory = sorted.map(component => [
  `${component.name}@${component.version}`,
  component.license,
  component.source ?? '',
].join(' | '))

// Many packages share byte-for-byte identical license files (especially the
// AWS SDK packages). Keep the full component inventory above, but print each
// exact license/notice bundle only once to avoid bloating the shipped VSIX.
const noticeGroups = new Map()
for (const component of sorted) {
  const key = JSON.stringify(component.notices)
  const group = noticeGroups.get(key) ?? { components: [], notices: component.notices }
  group.components.push(`${component.name}@${component.version}`)
  noticeGroups.set(key, group)
}

const sections = [...noticeGroups.values()].map(group => {
  const componentList = group.components.map(component => `- ${component}`).join('\n')
  const notices = group.notices
    .map(notice => `${notice.name}\n${'-'.repeat(notice.name.length)}\n${notice.text}`)
    .join('\n\n')
  return `Components using the following notice text:\n${componentList}\n\n${notices}`
})

const output = `THIRD-PARTY SOFTWARE NOTICES AND INFORMATION

TupleBase includes third-party software. This file is generated from the
production dependency graph in package-lock.json by running:

    npm run gen:notices

The following notices are provided for attribution and informational purposes.
They do not alter the license terms of TupleBase itself.

COMPONENT INVENTORY (${sorted.length})

Package | License | Source
${inventory.join('\n')}

LICENSE AND NOTICE TEXTS (${noticeGroups.size} unique bundles)

${sections.join(`\n\n${'='.repeat(80)}\n\n`)}
`

writeFileSync(join(root, 'THIRD-PARTY-NOTICES'), `${normalizeText(output)}\n`)
console.log(`Wrote THIRD-PARTY-NOTICES for ${sorted.length} components`)
