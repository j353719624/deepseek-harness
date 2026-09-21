#!/usr/bin/env node
/**
 * Fork addition: profile boot health check for the Desktop shell.
 *
 * The runtime reuses any profile whose node_modules exists, without verifying
 * that its required bundles resolve. A profile whose bundles are dangling
 * symlinks (e.g. they pointed into a since-removed global npm install) boots
 * with zero plugins: session creation and every chat turn die silently.
 *
 * This patch inserts a quarantine step into apps/desktop/src/main.ts: when the
 * active profile's node_modules exists but a required bundle's package.json is
 * missing/unresolvable, the whole profile directory is renamed aside so the
 * runtime rebuilds a fresh one on this boot.
 *
 * Two anchored edits in apps/desktop/src/main.ts:
 *   1. adds `import { existsSync, renameSync } from 'node:fs'`
 *   2. inserts the health check between `resolveDesktopPaths()` and
 *      `const activeProject = paths.profile`
 *
 * Idempotent. Usage: node patch-profile-health.mjs <apps/desktop/src/main.ts>
 */

import { readFileSync, writeFileSync } from 'node:fs'

const filePath = process.argv[2]
if (!filePath) { console.error('usage: patch-profile-health.mjs <main.ts>'); process.exit(1) }
let source = readFileSync(filePath, 'utf8')

if (source.includes('profile contained missing/broken bundles')) {
  console.log(`${filePath}: profile health check already patched`)
  process.exit(0)
}

const IMPORT_ANCHOR = "import { readFile, writeFile } from 'node:fs/promises'"
const IMPORT_PATCH = `${IMPORT_ANCHOR}\nimport { existsSync, renameSync } from 'node:fs'`

const BODY_ANCHOR = [
  '  const paths = resolveDesktopPaths()',
  '  const development = !app.isPackaged',
  '  const activeProject = paths.profile',
].join('\n')
const BODY_PATCH = [
  '  const paths = resolveDesktopPaths()',
  '  {',
  "    // Fork addition: quarantine a poisoned profile before the backend boots.",
  '    // The runtime reuses any profile whose node_modules exists, so dangling',
  '    // bundle symlinks (e.g. packages pointing into a since-removed global npm',
  '    // install) boot the shell with zero plugins and block session creation.',
  '    const profileNodeModules = join(paths.profile, "node_modules")',
  "    const requiredBundles = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']",
  '    if (existsSync(profileNodeModules)',
  "      && requiredBundles.some(bundle => !existsSync(join(profileNodeModules, bundle, 'package.json')))) {",
  '      const quarantine = `${paths.profile}.broken-${Date.now()}`',
  '      renameSync(paths.profile, quarantine)',
  "      console.warn(`dsh desktop: profile contained missing/broken bundles; quarantined to ${quarantine}`)",
  '    }',
  '  }',
  '  const development = !app.isPackaged',
  '  const activeProject = paths.profile',
].join('\n')

if (!source.includes(IMPORT_ANCHOR)) { console.error(`${filePath}: import anchor not found`); process.exit(1) }
if (!source.includes(BODY_ANCHOR)) { console.error(`${filePath}: body anchor not found — upstream changed main(); update this patch`); process.exit(1) }

source = source.replace(IMPORT_ANCHOR, IMPORT_PATCH)
source = source.replace(BODY_ANCHOR, BODY_PATCH)
writeFileSync(filePath, source)
console.log(`${filePath}: profile boot health check inserted`)
