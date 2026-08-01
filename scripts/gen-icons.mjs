// Compiles src/ui/icons/*.svg into dist/icons/tuplebase.woff. The glyph names
// become VS Code icon ids via contributes.icons in package.json, which is what
// lets the tree reference them as ThemeIcon('tb-table') and tint them.
//
// Codepoints are pinned here because package.json hard-codes the same values —
// letting fantasticon assign them would silently reshuffle icons on any rename.
import { generateFonts } from 'fantasticon'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync } from 'node:fs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
mkdirSync(join(root, 'dist/icons'), { recursive: true })

export const CODEPOINTS = {
  'tb-schema': 0xe001,
  'tb-table': 0xe002,
  'tb-field': 0xe003,
  'tb-pk': 0xe004,
}

await generateFonts({
  name: 'tuplebase',
  inputDir: join(root, 'src/ui/icons'),
  outputDir: join(root, 'dist/icons'),
  fontTypes: ['woff'],
  assetTypes: [],
  codepoints: CODEPOINTS,
  normalize: true,
  fontHeight: 1000,
  descent: 0,
})

console.log(`icons: ${Object.keys(CODEPOINTS).length} glyphs → dist/icons/tuplebase.woff`)
