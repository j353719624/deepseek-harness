#!/usr/bin/env node
/**
 * Conversation width: remove the drag handles and pin the content column to its
 * maximum width. The upstream component lets users drag the composer narrower
 * and persists that width, which reads as "the input box got stuck narrow".
 *
 * Two edits, both anchored:
 *   1. apps/desktop-side source `ConversationWidthControls.tsx`:
 *      resolveContentWidth() always returns the layout maximum.
 *   2. `ConversationRoot.module.css`: hide `[data-width-handle]` (stable data
 *      attribute; CSS-module class names are hashed and must not be matched).
 *
 * Idempotent. Usage: node patch-conversation-width.mjs <ui-conversation/skeleton dir>
 */

import { readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2]
if (!dir) { console.error('usage: patch-conversation-width.mjs <skeleton-dir>'); process.exit(1) }

const tsPath = join(dir, 'ConversationWidthControls.tsx')
const cssPath = join(dir, 'ConversationRoot.module.css')

const RESOLVE_ANCHOR = [
  'function resolveContentWidth(columnWidth: number, preference: number | null): number {',
  '  const max = Math.max(CONTENT_MIN, columnWidth - CONTENT_EDGE_BUDGET)',
  "  if (preference !== null) return Math.min(Math.max(preference, CONTENT_MIN), max)",
  '  return Math.max(680, Math.min(columnWidth * 0.64, 920))',
  '}',
].join('\n')
const RESOLVE_PATCH_V1 = [
  'function resolveContentWidth(columnWidth: number, preference: number | null): number {',
  '  void preference',
  '  return Math.max(CONTENT_MIN, columnWidth - CONTENT_EDGE_BUDGET)',
  '}',
].join('\n')
const RESOLVE_PATCH_V2 = [
  'function resolveContentWidth(columnWidth: number, preference: number | null): number {',
  '  void preference',
  '  void CONTENT_MIN',
  '  void CONTENT_EDGE_BUDGET',
  '  return columnWidth',
  '}',
].join('\n')

let ts = readFileSync(tsPath, 'utf8')
if (ts.includes(RESOLVE_PATCH_V2)) {
  console.log(`${tsPath}: already patched (v2, full-bleed width)`)
} else if (ts.includes(RESOLVE_ANCHOR)) {
  ts = ts.replace(RESOLVE_ANCHOR, RESOLVE_PATCH_V2)
  writeFileSync(tsPath, ts)
  console.log(`${tsPath}: content width pinned to full container width`)
} else if (ts.includes(RESOLVE_PATCH_V1)) {
  ts = ts.replace(RESOLVE_PATCH_V1, RESOLVE_PATCH_V2)
  writeFileSync(tsPath, ts)
  console.log(`${tsPath}: upgraded v1 (max minus handle budget) to v2 (full container width)`)
} else {
  console.error(`${tsPath}: anchor not found — upstream changed resolveContentWidth; update this patch`)
  process.exit(1)
}

const cssRule = '\n/* fork: the width drag handles are removed; the column is always at maximum width. */\n[data-width-handle] { display: none !important; }\n'
let css = readFileSync(cssPath, 'utf8')
if (css.includes('[data-width-handle]')) {
  console.log(`${cssPath}: handle-hiding rule already present`)
} else {
  appendFileSync(cssPath, cssRule)
  console.log(`${cssPath}: appended handle-hiding rule`)
}
