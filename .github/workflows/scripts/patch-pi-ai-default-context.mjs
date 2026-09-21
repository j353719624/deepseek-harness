#!/usr/bin/env node
/**
 * Raise the llm-pi-ai adapter's fallback context window from 262,144 to
 * 1,000,000 tokens (GLM-5.3-Flash's nominal capacity). Applies to models whose
 * entries do not declare their own contextWindow. Works on the TypeScript
 * source and on compiled bundles containing the numeric literal.
 * Usage: node patch-pi-ai-default-context.mjs <file> [more files...]
 */

import { readFileSync, writeFileSync } from 'node:fs'

const SOURCE_ANCHOR = 'export const DEFAULT_CONTEXT_WINDOW = 262_144'
const SOURCE_PATCH = 'export const DEFAULT_CONTEXT_WINDOW = 1_000_000'

for (const filePath of process.argv.slice(2)) {
  let content = readFileSync(filePath, 'utf8')
  if (content.includes(SOURCE_PATCH) || content.includes('DEFAULT_CONTEXT_WINDOW = 1e6')) {
    console.log(`${filePath}: already patched`)
    continue
  }
  if (content.includes(SOURCE_ANCHOR)) {
    writeFileSync(filePath, content.replace(SOURCE_ANCHOR, SOURCE_PATCH))
    console.log(`${filePath}: DEFAULT_CONTEXT_WINDOW 262_144 -> 1_000_000`)
    continue
  }
  // Compiled variant: bare numeric literal. Only rewrite inside files that
  // belong to the pi-ai adapter (caller scopes the file list).
  const count = (content.match(/262144/g) ?? []).length
  if (count === 0) {
    console.log(`${filePath}: no 262144 literal found, skipped`)
    continue
  }
  content = content.replaceAll('262144', '1000000')
  writeFileSync(filePath, content)
  console.log(`${filePath}: replaced ${count} × 262144 -> 1000000`)
}
