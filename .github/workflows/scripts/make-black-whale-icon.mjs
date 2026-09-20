#!/usr/bin/env node
/**
 * Convert the DeepSeek Harness app icon into a black-whale-on-transparent icon.
 *
 * The upstream icon is the whale in dark navy on a white rounded card with a soft
 * shadow. This script keys out light pixels, deletes any frame/card connected
 * component touching the canvas border, crops to the whale, and re-centers it on
 * a square transparent canvas. Pure Node (zlib only) so CI can run it before any
 * dependency install.
 *
 * Usage: node make-black-whale-icon.mjs <in.png> <out.png> [more pairs...]
 *        node make-black-whale-icon.mjs --verify <png>   (corner must be transparent)
 */

import { inflateSync, deflateSync } from 'node:zlib'
import { readFileSync, writeFileSync } from 'node:fs'

const DARK_LIMIT = 80   // luminance at or below this is fully opaque
const LIGHT_LIMIT = 180 // luminance at or above this is fully transparent

function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG')
  let offset = 8
  let width = 0; let height = 0; let depth = 0; let colorType = 0; let interlace = 0
  const idat = []
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4)
      depth = data[8]; colorType = data[9]; interlace = data[12]
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    offset += 12 + length
  }
  if (depth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(`unsupported PNG (depth=${depth} colorType=${colorType} interlace=${interlace}); expected 8-bit RGBA non-interlaced`)
  }
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * 4
  const pixels = Buffer.alloc(width * height * 4)
  let position = 0
  for (let y = 0; y < height; y += 1) {
    const filter = raw[position]; position += 1
    const row = raw.subarray(position, position + stride); position += stride
    const out = pixels.subarray(y * stride, (y + 1) * stride)
    for (let x = 0; x < stride; x += 1) {
      const left = x >= 4 ? out[x - 4] : 0
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0
      const upLeft = y > 0 && x >= 4 ? pixels[(y - 1) * stride + x - 4] : 0
      let value = row[x]
      if (filter === 1) value += left
      else if (filter === 2) value += up
      else if (filter === 3) value += (left + up) >> 1
      else if (filter === 4) {
        const p = left + up - upLeft
        const pa = Math.abs(p - left); const pb = Math.abs(p - up); const pc = Math.abs(p - upLeft)
        value += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft
      }
      out[x] = value & 0xff
    }
  }
  return { width, height, pixels }
}

function crc32Table() {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
}
const CRC = crc32Table()
function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

function encodePng(width, height, pixels) {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const luminance = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b

/** Key light pixels out and force survivors to solid black. */
function toBlackSilhouette({ width, height, pixels }) {
  const out = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i += 1) {
    const r = pixels[i * 4]; const g = pixels[i * 4 + 1]; const b = pixels[i * 4 + 2]
    const lum = luminance(r, g, b)
    let alpha
    if (lum <= DARK_LIMIT) alpha = 255
    else if (lum >= LIGHT_LIMIT) alpha = 0
    else alpha = Math.round(255 * (LIGHT_LIMIT - lum) / (LIGHT_LIMIT - DARK_LIMIT))
    alpha = Math.min(alpha, pixels[i * 4 + 3])
    out[i * 4] = 0; out[i * 4 + 1] = 0; out[i * 4 + 2] = 0; out[i * 4 + 3] = alpha
  }
  return { width, height, pixels: out }
}

/** Remove opaque components connected to the canvas border (card, frame). */
function removeBorderComponents({ width, height, pixels }) {
  const alphaAt = (x, y) => pixels[(y * width + x) * 4 + 3]
  const visited = new Uint8Array(width * height)
  const queue = []
  for (let x = 0; x < width; x += 1) { queue.push([x, 0], [x, height - 1]) }
  for (let y = 0; y < height; y += 1) { queue.push([0, y], [width - 1, y]) }
  while (queue.length > 0) {
    const [x, y] = queue.pop()
    if (x < 0 || y < 0 || x >= width || y >= height) continue
    const index = y * width + x
    if (visited[index] || alphaAt(x, y) < 16) continue
    visited[index] = 1
    pixels[index * 4 + 3] = 0
    queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1])
  }
  return { width, height, pixels }
}

function boundingBox({ width, height, pixels }) {
  let minX = width; let minY = height; let maxX = -1; let maxY = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] >= 16) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) throw new Error('no opaque pixels left after background removal')
  return { minX, minY, maxX, maxY }
}

/** Center the crop on a square canvas, whale filling `fill` of the side. */
function toCenteredSquare({ width, height, pixels }, box, size, fill = 0.92) {
  const boxW = box.maxX - box.minX + 1
  const boxH = box.maxY - box.minY + 1
  const side = Math.max(boxW, boxH)
  const scale = (size * fill) / side
  const out = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const sourceX = box.minX + (x - (size - boxW * scale) / 2) / scale
      const sourceY = box.minY + (y - (size - boxH * scale) / 2) / scale
      const x0 = Math.max(0, Math.min(width - 1, Math.floor(sourceX)))
      const y0 = Math.max(0, Math.min(height - 1, Math.floor(sourceY)))
      const x1 = Math.min(width - 1, x0 + 1); const y1 = Math.min(height - 1, y0 + 1)
      const fx = Math.max(0, Math.min(1, sourceX - x0)); const fy = Math.max(0, Math.min(1, sourceY - y0))
      for (let channel = 0; channel < 4; channel += 1) {
        const at = (px, py) => pixels[(py * width + px) * 4 + channel]
        const top = at(x0, y0) * (1 - fx) + at(x1, y0) * fx
        const bottom = at(x0, y1) * (1 - fx) + at(x1, y1) * fx
        out[(y * size + x) * 4 + channel] = Math.round(top * (1 - fy) + bottom * fy)
      }
    }
  }
  return { width: size, height: size, pixels: out }
}

const args = process.argv.slice(2)
if (args[0] === '--verify') {
  const { width, pixels } = decodePng(readFileSync(args[1]))
  const cornerAlpha = pixels[3]
  let opaque = 0
  for (let i = 0; i < width * width; i += 1) if (pixels[i * 4 + 3] >= 16) opaque += 1
  const ratio = (opaque / (width * width) * 100).toFixed(1)
  if (cornerAlpha !== 0) { console.error(`verify failed: corner alpha ${cornerAlpha}`); process.exit(1) }
  if (opaque < width * width * 0.02) { console.error(`verify failed: only ${ratio}% opaque pixels`); process.exit(1) }
  console.log(`icon ok: corner transparent, ${ratio}% of ${width}x${width} pixels are black whale`)
  process.exit(0)
}

for (let i = 0; i + 1 < args.length; i += 2) {
  const image = toBlackSilhouette(decodePng(readFileSync(args[i])))
  const box = boundingBox(removeBorderComponents(image))
  const square = toCenteredSquare(image, box, image.width)
  writeFileSync(args[i + 1], encodePng(square.width, square.height, square.pixels))
  console.log(`${args[i]} -> ${args[i + 1]} (${square.width}x${square.height}, whale at ${box.minX},${box.minY}..${box.maxX},${box.maxY})`)
}
