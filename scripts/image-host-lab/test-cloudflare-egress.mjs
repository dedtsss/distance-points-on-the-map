import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const workerUrl = process.env.WORKER_URL
if (!workerUrl) throw new Error('WORKER_URL is required.')

const labDir = dirname(fileURLToPath(import.meta.url))
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

function png(width, height, noisy) {
  let state = 0x92d68ca2
  const random = () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return state >>> 0
  }
  const raw = Buffer.alloc((width + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const row = y * (width + 1)
    for (let x = 0; x < width; x += 1) raw[row + x + 1] = noisy ? random() & 0xff : (x + y) & 0xff
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

async function currentFreeimageKey() {
  const response = await fetch('https://freeimage.host/api')
  const html = await response.text()
  const key = html.match(/<h2>API Key<\/h2>[\s\S]*?<input[^>]+value="([^"]+)"/i)?.[1]
  if (!response.ok || !key) throw new Error('Could not read the current public Freeimage API key.')
  return key
}

async function callWorker(target, fixture, knownKey, scenario = 'current-key') {
  const form = new FormData()
  form.append('target', target)
  form.append('file', new Blob([fixture.bytes], { type: 'image/png' }), fixture.name)
  if (target === 'freeimage') form.append('knownFreeimageKey', knownKey)
  const startedAt = performance.now()
  const response = await fetch(workerUrl, { method: 'POST', body: form, signal: AbortSignal.timeout(120_000) })
  const text = await response.text()
  let data = null
  try { data = JSON.parse(text) } catch { /* reported in result */ }
  return {
    target,
    scenario,
    fixture: { name: fixture.name, sizeBytes: fixture.bytes.length, sha256: createHash('sha256').update(fixture.bytes).digest('hex') },
    workerStatus: response.status,
    roundTripMs: Math.round(performance.now() - startedAt),
    ...(data ?? { ok: false, error: text.slice(0, 500) }),
  }
}

function markdown(report) {
  const lines = [
    '# Cloudflare Worker Egress — Image Host Test', '',
    `Дата/время: ${report.generatedAt}`, `Worker: temporary workers.dev deployment`, '',
    '| Provider | Scenario | File | Worker | Edge | Upload | Key check | GET/GET | Type | Exact | Total ms |',
    '|---|---|---:|---:|---|---:|---|---|---|---|---:|',
  ]
  for (const item of report.results) {
    const key = item.keyCheck ? `${item.keyCheck.matchedConfiguredKey ? 'matched' : 'refreshed'}${item.keyCheck.pageFetchTimeMs ? ` (${item.keyCheck.pageFetchTimeMs} ms)` : ''}` : 'n/a'
    lines.push(`| ${item.provider ?? item.target} | ${item.scenario} | ${item.fixture.sizeBytes} B | ${item.workerStatus} | ${item.edge ?? '—'} | ${item.uploadStatus ?? '—'} | ${key} | ${item.verification ? `${item.verification.firstGet?.status}/${item.verification.secondGet?.status}` : '—'} | ${item.verification?.firstGet?.contentType ?? '—'} | ${item.verification?.exactContent ? 'yes' : 'no'} | ${item.totalTimeMs ?? item.roundTripMs} |`)
  }
  lines.push('', `Итог: ${report.ok ? 'PASS — оба сервиса работают через Cloudflare Worker egress.' : 'FAIL — есть ошибки Cloudflare egress.'}`, '')
  return lines.join('\n')
}

const key = await currentFreeimageKey()
const runId = Date.now()
const fixtures = [
  { name: `cf-egress-${runId}-small.png`, bytes: png(1024, 768, false) },
  { name: `cf-egress-${runId}-medium.png`, bytes: png(1024, 768, true) },
]
const results = []
for (const target of ['freeimage', 'x0']) {
  for (const fixture of fixtures) {
    console.log(`Testing ${target}: ${fixture.name} (${fixture.bytes.length} bytes)`)
    const result = await callWorker(target, fixture, key)
    results.push(result)
    console.log(`  Worker HTTP ${result.workerStatus}; upload ${result.uploadStatus ?? 'error'}; ok=${result.ok}; edge=${result.edge ?? 'unknown'}`)
  }
}
console.log('Testing freeimage key refresh with an intentionally stale configured key')
const refreshed = await callWorker('freeimage', fixtures[0], 'intentionally-stale-key-for-lab', 'stale-key-refresh')
if (!refreshed.keyCheck?.refreshedFromPage || refreshed.keyCheck?.matchedConfiguredKey) {
  refreshed.ok = false
  refreshed.error = 'The stale-key refresh branch was not confirmed.'
}
results.push(refreshed)
console.log(`  Worker HTTP ${refreshed.workerStatus}; upload ${refreshed.uploadStatus ?? 'error'}; ok=${refreshed.ok}; refreshed=${refreshed.keyCheck?.refreshedFromPage ?? false}`)
const report = {
  generatedAt: new Date().toISOString(),
  workerType: 'Cloudflare temporary deployment; URL and claim token intentionally omitted.',
  fixturePolicy: 'Synthetic PNG only; no user photos, EXIF/GPS, or personal data.',
  ok: results.every((item) => item.ok),
  results,
}
await mkdir(resultsDir, { recursive: true })
await writeFile(join(resultsDir, 'cloudflare-egress-latest.json'), `${JSON.stringify(report, null, 2)}\n`)
await writeFile(join(resultsDir, 'cloudflare-egress-latest.md'), markdown(report))
if (!report.ok) process.exitCode = 1
