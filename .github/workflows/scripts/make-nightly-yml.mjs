#!/usr/bin/env node
/**
 * Generate electron-updater generic-provider channel metadata (nightly.yml)
 * for one built Windows installer.
 *
 * Usage: node make-nightly-yml.mjs <installer.exe> <absolute-download-url> <output.yml>
 */

import { createHash } from 'node:crypto'
import { readFileSync, statSync, writeFileSync } from 'node:fs'

const [installerPath, installerUrl, outputPath] = process.argv.slice(2)
if (!installerPath || !installerUrl || !outputPath) {
  console.error('usage: make-nightly-yml.mjs <installer.exe> <absolute-download-url> <output.yml>')
  process.exit(1)
}

const bytes = readFileSync(installerPath)
const sha512 = createHash('sha512').update(bytes).digest('base64')
const version = String(installerPath.match(/deepseek-harness-(.+)-win-x64\.exe$/)?.[1] ?? '')
if (!/^\d+\.\d+\.\d+/.test(version)) {
  console.error(`cannot parse version from ${installerPath}`)
  process.exit(1)
}

// electron-updater UpdateInfo for a generic provider; `url` must be absolute per this feed's layout.
const info = {
  version,
  releaseDate: new Date().toISOString(),
  releaseName: `DeepSeek Harness ${version}`,
  files: [{ url: installerUrl, sha512, size: statSync(installerPath).size }],
  // GitHub's /releases/latest/download/ URL is a redirect served without a sha512 filename pair,
  // so keep top-level fields too for older electron-updater code paths.
  path: installerUrl,
  sha512,
}

writeFileSync(outputPath, `${JSON.stringify(info, null, 2)}\n`)
console.log(`nightly.yml written: version ${version}, sha512 ${sha512.slice(0, 12)}…, ${info.files[0].size} bytes`)
