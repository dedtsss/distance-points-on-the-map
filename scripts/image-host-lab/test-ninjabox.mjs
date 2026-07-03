import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

import { providerInfo, uploadBatch } from './providers/ninjabox.mjs'

const workerUrl = process.env.WORKER_URL ?? null
const mode = workerUrl ? 'cloudflare-egress' : 'direct-node'
const labDir = dirname(fileURLToPath(import.meta.url))
const fixtureDir = join(labDir, 'fixtures')
const resultsDir = join(labDir, 'results')

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0)
  return value >>> 0
})

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff]
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type)
  const length = Buffer.alloc(4)
  const checksum = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])))
  return Buffer.concat([length, typeBytes, data, checksum])
}

function makePng(index) {
  const width = 1024
  const height = 768
  let state = (0x7f4a7c15 + index * 7919) >>> 0
  const random = () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return state >>> 0
  }
  const noiseEvery = 2 + (index % 5)
  const raw = Buffer.alloc((width + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const row = y * (width + 1)
    for (let x = 0; x < width; x += 1) {
      raw[row + x + 1] = (x + y * width) % noiseEvery === 0 ? random() & 0xff : (x + y + index) & 0xff
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ])
}

async function fixtures() {
  await mkdir(fixtureDir, { recursive: true })
  const runId = Date.now()
  const result = []
  for (let index = 0; index < 10; index += 1) {
    const bytes = makePng(index)
    const fileName = `ninjabox-lab-${runId}-${String(index + 1).padStart(2, '0')}.png`
    const filePath = join(fixtureDir, fileName)
    await writeFile(filePath, bytes)
    result.push({ index: index + 1, fileName, filePath, mimeType: 'image/png', sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), bytes })
  }
  return result
}

async function viaWorker(files) {
  const form = new FormData()
  for (const file of files) form.append('files', new Blob([file.bytes], { type: file.mimeType }), file.fileName)
  const startedAt = performance.now()
  const response = await fetch(workerUrl, { method: 'POST', body: form, signal: AbortSignal.timeout(180_000) })
  const text = await response.text()
  let payload = null
  try { payload = JSON.parse(text) } catch { /* reported below */ }
  return {
    ...(payload ?? { ok: false, error: text.slice(0, 800) }),
    workerStatus: response.status,
    roundTripMs: Math.round(performance.now() - startedAt),
  }
}

async function verifyViaWorker(commonPageUrl) {
  const form = new FormData()
  form.append('verifyCommonPageUrl', commonPageUrl)
  const response = await fetch(workerUrl, { method: 'POST', body: form, signal: AbortSignal.timeout(180_000) })
  const text = await response.text()
  let payload = null
  try { payload = JSON.parse(text) } catch { /* reported below */ }
  return { ...(payload ?? { ok: false, error: text.slice(0, 800) }), workerStatus: response.status }
}

async function directGetTwice(kind, url) {
  const gets = []
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const startedAt = performance.now()
    const response = await fetch(url, {
      headers: { 'User-Agent': 'GPS-Checker-Image-Host-Lab/1.0', Accept: 'image/*, text/html;q=0.8' },
      signal: AbortSignal.timeout(60_000),
    })
    const bytes = await response.arrayBuffer()
    gets.push({
      status: response.status,
      contentType: response.headers.get('content-type'),
      cfMitigated: response.headers.get('cf-mitigated'),
      bytes: bytes.byteLength,
      responseTimeMs: Math.round(performance.now() - startedAt),
    })
  }
  return { kind, url, gets, repeatGet: gets.every((item) => item.status === 200) }
}

function markdown(report) {
  const result = report.result
  return [
    '# Ninjabox 10-Image Batch Test', '',
    `Дата/время: ${report.generatedAt}`,
    `Режим: ${report.mode}`,
    `Файлы: ${report.fixtures.length} synthetic PNG, ${report.totalBytes} bytes total`, '',
    `- Result: ${report.verdict}`,
    `- HTTP status: ${result.workerStatus ?? result.status ?? 'network error'}`,
    `- Batch upload: HTTP ${result.initialUpload?.status ?? result.upload?.status ?? result.status ?? 'network error'}, ${result.initialUpload?.responseTimeMs ?? result.upload?.responseTimeMs ?? result.responseTimeMs ?? 'n/a'} ms`,
    `- Cloudflare challenge: ${result.challenged ?? result.upload?.challenged ?? false}`,
    `- Common page: ${result.challenged || result.upload?.challenged ? 'none' : result.commonPageUrl ?? result.finalUrl ?? 'none'}`,
    `- Returned URLs: ${(result.returnedUrls ?? []).length}`,
    `- Verified image URLs: ${(result.imageUrls ?? []).length}`,
    `- Worker repeat GET: ${(result.urlChecks ?? []).filter((item) => item.repeatGet).length}/${(result.urlChecks ?? []).length}`,
    `- Direct Node representative access: ${(result.directNodeChecks ?? []).map((item) => `${item.kind}=${item.gets.map((get) => get.status).join('/')}`).join(', ') || 'not tested'}`,
    `- Error: ${result.error ?? 'none'}`, '',
    '## Files', '',
    '| # | Name | Bytes | SHA-256 |', '|---:|---|---:|---|',
    ...report.fixtures.map((file) => `| ${file.index} | ${file.fileName} | ${file.sizeBytes} | ${file.sha256} |`),
    '',
  ].join('\n')
}

await mkdir(resultsDir, { recursive: true })
const prefix = workerUrl ? 'ninjabox-cloudflare-latest' : 'ninjabox-direct-latest'
let report
const verifyCommonPageUrl = process.env.VERIFY_COMMON_PAGE_URL
if (workerUrl && verifyCommonPageUrl) {
  const existing = JSON.parse(await readFile(join(resultsDir, `${prefix}.json`), 'utf8'))
  const verification = await verifyViaWorker(verifyCommonPageUrl)
  verification.directNodeChecks = await Promise.all([
    directGetTwice('gallery', verification.commonPageUrl),
    directGetTwice('individual-page', verification.individualPageUrls[0]),
    directGetTwice('direct-image', verification.imageUrls[0]),
  ])
  report = {
    ...existing,
    generatedAt: new Date().toISOString(),
    result: {
      ...verification,
      initialUpload: existing.result.initialUpload ?? existing.result.upload,
      initialRoundTripMs: existing.result.initialRoundTripMs ?? existing.result.roundTripMs,
    },
  }
  console.log(`Existing gallery verification: ok=${verification.ok}; pages=${verification.individualPageUrls?.length ?? 0}; images=${verification.imageUrls?.length ?? 0}`)
} else {
  const files = await fixtures()
  console.log(`Ninjabox ${mode}: one batch with 10 synthetic PNG files (${files.reduce((sum, file) => sum + file.sizeBytes, 0)} bytes)`)
  const result = workerUrl ? await viaWorker(files) : await uploadBatch(files)
  console.log(`Result: ok=${result.ok}; HTTP=${result.workerStatus ?? result.status ?? 'network'}; challenge=${result.challenged ?? result.upload?.challenged ?? false}; URLs=${result.returnedUrls?.length ?? 0}`)
  report = {
    generatedAt: new Date().toISOString(), mode,
    provider: providerInfo,
    fixturePolicy: 'Synthetic PNG only; no user photos, EXIF/GPS, or personal data.',
    fixtures: files.map(({ filePath, bytes, ...file }) => file),
    totalBytes: files.reduce((sum, file) => sum + file.sizeBytes, 0),
    result,
  }
  for (const file of files) await rm(file.filePath, { force: true })
}
report.verdict = report.result.ok ? 'PASS' : 'FAIL'
await writeFile(join(resultsDir, `${prefix}.json`), `${JSON.stringify(report, null, 2)}\n`)
await writeFile(join(resultsDir, `${prefix}.md`), markdown(report))
if (!report.result.ok) process.exitCode = 1
