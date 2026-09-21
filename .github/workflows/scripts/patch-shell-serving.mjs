#!/usr/bin/env node
/**
 * Serve dsh-app://shell/* documents (update-dialog.html, mandatory-update.html, …).
 *
 * Upstream 0.1.6-alpha.2's protocol handler only routes the `app` hostname and
 * returns 404 for everything else, so every shell dialog loads an empty page and
 * the app hangs behind an invisible modal with a blurred main window. This patch
 * inserts a `shell` hostname branch that serves the packaged renderer files.
 *
 * Works on both the TypeScript source and the bundled lib/main.js. Idempotent.
 * Usage: node patch-shell-serving.mjs <main.ts | main.js>
 */

import { readFileSync, writeFileSync } from 'node:fs'

const filePath = process.argv[2]
if (!filePath) { console.error('usage: patch-shell-serving.mjs <main.ts|main.js>'); process.exit(1) }
let source = readFileSync(filePath, 'utf8')

if (source.includes("url.hostname === 'shell'") || source.includes('url.hostname === "shell"')) {
  console.log(`${filePath}: shell serving already patched`)
  process.exit(0)
}

const sourceBranch = [
  "    if (url.hostname === 'shell') {",
  "      const filename = url.pathname.slice(1)",
  "      if (!/^[a-z0-9][a-z0-9.-]*$/i.test(filename)) return new Response(null, { status: 404 })",
  "      return readFile(join(app.getAppPath(), 'renderer', filename)).then(document => new Response(document, {",
  "        headers: { 'content-type': filename.endsWith('.html') ? 'text/html; charset=utf-8'",
  "          : filename.endsWith('.css') ? 'text/css; charset=utf-8'",
  "          : filename.endsWith('.js') ? 'text/javascript; charset=utf-8'",
  "          : filename.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream' },",
  "      })).catch(() => new Response(null, { status: 404 }))",
  "    }",
].join('\n')

const compiledBranch = [
  '\t\tif (url.hostname === "shell") {',
  '\t\t\tconst filename = url.pathname.slice(1);',
  '\t\t\tif (!/^[a-z0-9][a-z0-9.-]*$/i.test(filename)) return new Response(null, { status: 404 });',
  '\t\t\treturn readFile(join(app.getAppPath(), "renderer", filename)).then((document) => new Response(document, {',
  '\t\t\t\theaders: { "content-type": filename.endsWith(".html") ? "text/html; charset=utf-8" : filename.endsWith(".css") ? "text/css; charset=utf-8" : filename.endsWith(".js") ? "text/javascript; charset=utf-8" : filename.endsWith(".svg") ? "image/svg+xml" : "application/octet-stream" }',
  '\t\t\t})).catch(() => new Response(null, { status: 404 }));',
  '\t\t}',
].join('\n')

const sourceAnchor = "const url = new URL(request.url)\n    if (url.hostname === 'app') {"
const compiledAnchor = 'const url = new URL(request.url);\n\t\tif (url.hostname === "app") {'

let branch; let anchor
if (source.includes(sourceAnchor)) { anchor = sourceAnchor; branch = sourceBranch }
else if (source.includes(compiledAnchor)) { anchor = compiledAnchor; branch = compiledBranch }
else { console.error(`${filePath}: anchor not found — upstream changed the protocol handler; update this patch`); process.exit(1) }

source = source.replace(anchor, `${anchor.split('\n')[0]}\n${branch}\n${anchor.split('\n')[1]}`)
writeFileSync(filePath, source)
console.log(`${filePath}: inserted shell document serving before the app-hostname branch`)
