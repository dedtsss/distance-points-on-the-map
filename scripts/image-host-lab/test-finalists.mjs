import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

import * as freeimageWeb from './providers/freeimage.mjs'
import * as x0 from './providers/x0.mjs'
import { REQUEST_TIMEOUT_MS, USER_AGENT, isPublicHttpUrl } from './lib/provider-utils.mjs'

const FILE_COUNT = 20
const labDir = dirname(fileURLToPath(import.meta.url))
const fixtureDir = join(labDir, 'fixtures')
const resultsDir = join(labDir, 'results')
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

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

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii')
  const length = Buffer.alloc(4)
  const checksum = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])))
  return Buffer.concat([length, typeBytes, data, checksum])
}

function makePrng(seed) {
  let state = seed >>> 0
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return state >>> 0
  }
}

function createFixturePng(index) {
  const width = 1024
  const height = 768
  const raw = Buffer.alloc((width + 1) * height)
  const random = makePrng(0x51f15e + index * 7919)
  const noiseEvery = 3 + (index % 6)
  for (let y = 0; y < height; y += 1) {
    const row = y * (width + 1)
    raw[row] = 0
    for (let x = 0; x < width; x += 1) {
      const gradient = (x + y + index * 13) & 0xff
      raw[row + x + 1] = (x + y * width) % noiseEvery === 0 ? random() & 0xff : gradient
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 0
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

async function createFixtures(runId) {
  await mkdir(fixtureDir, { recursive: true })
  const fixtures = []
  for (let index = 0; index < FILE_COUNT; index += 1) {
    const bytes = createFixturePng(index)
    const fileName = `gps-checker-final-${runId}-${String(index + 1).padStart(2, '0')}.png`
    const filePath = join(fixtureDir, fileName)
    await writeFile(filePath, bytes)
    fixtures.push({
      index: index + 1,
      fileName,
      filePath,
      mimeType: 'image/png',
      width: 1024,
      height: 768,
      sizeBytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    })
  }
  return fixtures
}

async function loadFreeimageApiConfig() {
  const response = await fetch('https://freeimage.host/api', {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  const html = await response.text()
  const key = html.match(/<h2>API Key<\/h2>[\s\S]*?<input[^>]+value="([^"]+)"/i)?.[1]
  const endpoint = html.match(/<h3>Request URL<\/h3>[\s\S]*?<input[^>]+value="(https:\/\/freeimage\.host\/api\/1\/upload)"/i)?.[1]
  if (!response.ok || !key || !endpoint) throw new Error('Could not read the public API key or endpoint from https://freeimage.host/api')
  return { key, endpoint }
}

async function uploadFreeimageApi(file, api) {
  const startedAt = performance.now()
  try {
    const bytes = await readFile(file.filePath)
    const form = new FormData()
    form.append('key', api.key)
    form.append('action', 'upload')
    form.append('format', 'json')
    form.append('source', new Blob([bytes], { type: file.mimeType }), file.fileName)
    const response = await fetch(api.endpoint, {
      method: 'POST',
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      body: form,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const responseText = await response.text()
    let payload = null
    try { payload = JSON.parse(responseText) } catch { /* reported below */ }
    const url = payload?.image?.url_viewer ?? null
    const directImageUrl = payload?.image?.url ?? payload?.image?.display_url ?? null
    const ok = response.ok && payload?.status_code === 200
      && isPublicHttpUrl(url) && isPublicHttpUrl(directImageUrl)
    return {
      provider: 'Freeimage.host',
      method: 'public-api',
      ok,
      uploadStatus: response.status,
      url: ok ? url : null,
      directImageUrl: ok ? directImageUrl : null,
      responseTimeMs: Math.round(performance.now() - startedAt),
      contentType: file.mimeType,
      sizeBytes: file.sizeBytes,
      error: ok ? null : payload?.error?.message ?? `API upload failed (HTTP ${response.status})`,
      apiStatusCode: payload?.status_code ?? null,
    }
  } catch (error) {
    return {
      provider: 'Freeimage.host', method: 'public-api', ok: false, uploadStatus: null,
      url: null, directImageUrl: null, responseTimeMs: Math.round(performance.now() - startedAt),
      contentType: file.mimeType, sizeBytes: file.sizeBytes, error: error.message,
    }
  }
}

async function verifyDirectUrl(url, file) {
  const checks = { head: null, firstGet: null, secondGet: null, repeatGet: false, directImage: false, exactSize: false, exactContent: false, error: null }
  try {
    const headStarted = performance.now()
    const head = await fetch(url, {
      method: 'HEAD', headers: { 'User-Agent': USER_AGENT, Accept: 'image/*' }, redirect: 'follow',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    checks.head = {
      status: head.status,
      contentType: head.headers.get('content-type'),
      contentLength: Number(head.headers.get('content-length')) || null,
      responseTimeMs: Math.round(performance.now() - headStarted),
    }
    for (const field of ['firstGet', 'secondGet']) {
      const startedAt = performance.now()
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'image/*' }, redirect: 'follow',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      const bytes = Buffer.from(await response.arrayBuffer())
      checks[field] = {
        status: response.status,
        contentType: response.headers.get('content-type'),
        contentLength: Number(response.headers.get('content-length')) || null,
        receivedBytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        responseTimeMs: Math.round(performance.now() - startedAt),
      }
    }
    checks.repeatGet = checks.firstGet.status === 200 && checks.secondGet.status === 200
    checks.directImage = checks.repeatGet
      && checks.firstGet.contentType?.startsWith('image/') === true
      && checks.secondGet.contentType?.startsWith('image/') === true
    checks.exactSize = checks.firstGet.receivedBytes === file.sizeBytes && checks.secondGet.receivedBytes === file.sizeBytes
    checks.exactContent = checks.firstGet.sha256 === file.sha256 && checks.secondGet.sha256 === file.sha256
  } catch (error) {
    checks.error = error.message
  }
  return checks
}

async function verifyViewerUrl(url) {
  if (!url) return null
  try {
    const startedAt = performance.now()
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' }, redirect: 'follow',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    await response.arrayBuffer()
    return { status: response.status, contentType: response.headers.get('content-type'), responseTimeMs: Math.round(performance.now() - startedAt) }
  } catch (error) {
    return { status: null, contentType: null, responseTimeMs: null, error: error.message }
  }
}

async function exerciseProvider(name, fixtures, upload) {
  const startedAt = performance.now()
  const results = []
  console.log(`\n${name}: starting ${fixtures.length} sequential uploads`)
  for (const file of fixtures) {
    const result = await upload(file)
    if (result.ok) {
      result.verification = await verifyDirectUrl(result.directImageUrl, file)
      if (result.url !== result.directImageUrl) result.viewerVerification = await verifyViewerUrl(result.url)
    }
    results.push({ file: { index: file.index, fileName: file.fileName, sizeBytes: file.sizeBytes, sha256: file.sha256 }, ...result })
    console.log(`  ${String(file.index).padStart(2, '0')}/20 HTTP ${result.uploadStatus ?? 'error'} ${result.ok ? `OK ${result.responseTimeMs} ms` : result.error}`)
    if (file.index < fixtures.length) await pause(150)
  }
  return { name, elapsedMs: Math.round(performance.now() - startedAt), uploads: results }
}

function percentile(values, percentileValue) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil((percentileValue / 100) * sorted.length) - 1)]
}

function summarize(provider) {
  const successful = provider.uploads.filter((item) => item.ok)
  const times = provider.uploads.map((item) => item.responseTimeMs).filter(Number.isFinite)
  const statusCounts = {}
  for (const item of provider.uploads) {
    const status = String(item.uploadStatus ?? 'network-error')
    statusCounts[status] = (statusCounts[status] ?? 0) + 1
  }
  return {
    attempted: provider.uploads.length,
    uploaded: successful.length,
    publicUrls: successful.filter((item) => isPublicHttpUrl(item.url)).length,
    directUrls: successful.filter((item) => isPublicHttpUrl(item.directImageUrl)).length,
    repeatGet: successful.filter((item) => item.verification?.repeatGet).length,
    exactContent: successful.filter((item) => item.verification?.exactContent).length,
    viewerPages: successful.filter((item) => item.viewerVerification?.status === 200).length,
    rateLimited: provider.uploads.filter((item) => item.uploadStatus === 429).length,
    uploadTimeMs: { min: Math.min(...times), median: percentile(times, 50), p95: percentile(times, 95), max: Math.max(...times) },
    statusCounts,
  }
}

function renderMarkdown(report) {
  const lines = [
    '# Image Host Finalists — 20 File Stream Test', '',
    `Дата/время: ${report.generatedAt}`, `Commit: ${report.commit}`, `Node: ${report.nodeVersion}`, '',
    'Режим: 20 последовательных загрузок на сервис, пауза 150 мс; HEAD и два GET каждой direct-ссылки.', '',
    '## Summary', '',
    '| Provider | Method | Upload | URLs | Direct | Repeat GET | Exact bytes | 429 | Upload ms min/median/p95/max |',
    '|---|---|---:|---:|---:|---:|---:|---:|---|',
  ]
  for (const provider of report.providers) {
    const s = provider.summary
    lines.push(`| ${provider.name} | ${provider.method} | ${s.uploaded}/${s.attempted} | ${s.publicUrls}/${s.attempted} | ${s.directUrls}/${s.attempted} | ${s.repeatGet}/${s.attempted} | ${s.exactContent}/${s.attempted} | ${s.rateLimited} | ${s.uploadTimeMs.min}/${s.uploadTimeMs.median}/${s.uploadTimeMs.p95}/${s.uploadTimeMs.max} |`)
  }
  for (const provider of report.providers) {
    lines.push('', `## ${provider.name}`, '', `Метод: ${provider.method}`, '', '| # | Bytes | Upload | ms | URL | GET/GET | Content-Type | Exact |', '|---:|---:|---:|---:|---|---|---|---|')
    for (const item of provider.uploads) {
      const verify = item.verification
      lines.push(`| ${item.file.index} | ${item.file.sizeBytes} | ${item.uploadStatus ?? 'error'} | ${item.responseTimeMs} | ${item.url ?? item.error ?? 'none'} | ${verify ? `${verify.firstGet?.status ?? 'error'}/${verify.secondGet?.status ?? 'error'}` : '—'} | ${verify?.firstGet?.contentType ?? '—'} | ${verify?.exactContent ? 'yes' : 'no'} |`)
    }
  }
  lines.push('', '## Conclusion', '', report.conclusion, '')
  return lines.join('\n')
}

async function main() {
  const runId = new Date().toISOString().replace(/[-:.TZ]/g, '')
  await mkdir(resultsDir, { recursive: true })
  const fixtures = await createFixtures(runId)
  const sizes = fixtures.map((file) => file.sizeBytes)
  console.log(`Created ${fixtures.length} synthetic PNG files: ${Math.min(...sizes)}-${Math.max(...sizes)} bytes`)

  const api = await loadFreeimageApiConfig()
  console.log('Freeimage.host: public API configuration loaded from /api (key is not persisted)')
  const probe = await uploadFreeimageApi(fixtures[0], api)
  let freeimage
  if (probe.ok) {
    console.log(`Freeimage.host API probe: HTTP ${probe.uploadStatus} OK; continuing with API`)
    const upload = async (file) => file.index === 1 ? probe : uploadFreeimageApi(file, api)
    freeimage = await exerciseProvider('Freeimage.host', fixtures, upload)
    freeimage.method = 'public-api'
  } else {
    console.log(`Freeimage.host API probe failed: ${probe.error}; falling back to anonymous web upload`)
    freeimage = await exerciseProvider('Freeimage.host', fixtures, freeimageWeb.upload)
    freeimage.method = 'anonymous-web-fallback'
    freeimage.apiProbe = { status: probe.uploadStatus, error: probe.error }
  }
  const x0Result = await exerciseProvider('x0.at', fixtures, x0.upload)
  x0Result.method = 'multipart-form'

  for (const provider of [freeimage, x0Result]) provider.summary = summarize(provider)
  const allPassed = [freeimage, x0Result].every((provider) => provider.summary.uploaded === FILE_COUNT
    && provider.summary.publicUrls === FILE_COUNT && provider.summary.repeatGet === FILE_COUNT)
  const report = {
    generatedAt: new Date().toISOString(),
    commit: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: join(labDir, '../..'), encoding: 'utf8' }).trim(),
    nodeVersion: process.version,
    fixturePolicy: '20 synthetic 1024x768 PNG files; no user photos, EXIF, GPS, or personal data.',
    providers: [freeimage, x0Result],
    conclusion: allPassed
      ? 'Both finalists accepted all 20 files and returned reusable public links; see latency and integrity results above.'
      : 'At least one finalist did not complete all 20 uploads or reusable-link checks; review the failed rows above.',
  }
  await writeFile(join(resultsDir, 'finalists-latest.json'), `${JSON.stringify(report, null, 2)}\n`)
  await writeFile(join(resultsDir, 'finalists-latest.md'), renderMarkdown(report))
  for (const fixture of fixtures) await rm(fixture.filePath, { force: true })
  console.log(`\nReports written to ${join(resultsDir, 'finalists-latest.json')} and finalists-latest.md`)
  console.log(report.providers.map((provider) => `${provider.name}: ${provider.summary.uploaded}/${FILE_COUNT}, repeat GET ${provider.summary.repeatGet}/${FILE_COUNT}, 429=${provider.summary.rateLimited}`).join('\n'))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
