import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

import * as zeroXZero from './providers/0x0.mjs'
import * as xZero from './providers/x0.mjs'
import * as pixeldrain from './providers/pixeldrain.mjs'
import * as gofile from './providers/gofile.mjs'
import * as bashify from './providers/bashify.mjs'
import * as vgy from './providers/vgy.mjs'
import * as freeimage from './providers/freeimage.mjs'
import * as postimages from './providers/postimages.mjs'
import * as usapic from './providers/usapic.mjs'
import * as imgbox from './providers/imgbox.mjs'
import * as pixsafe from './providers/pixsafe.mjs'
import * as filesfm from './providers/filesfm.mjs'
import { looksBlockedOrHtml, REQUEST_TIMEOUT_MS, USER_AGENT } from './lib/provider-utils.mjs'

const labDir = dirname(fileURLToPath(import.meta.url))
const fixtureDir = join(labDir, 'fixtures')
const resultsDir = join(labDir, 'results')
const providerCatalog = new Map([
  ['0x0', zeroXZero],
  ['x0', xZero],
  ['pixeldrain', pixeldrain],
  ['gofile', gofile],
  ['bashify', bashify],
  ['vgy', vgy],
  ['freeimage', freeimage],
  ['postimages', postimages],
  ['usapic', usapic],
  ['imgbox', imgbox],
  ['pixsafe', pixsafe],
  ['filesfm', filesfm],
])

function selectedProviders() {
  const option = process.argv.find((argument) => argument.startsWith('--providers='))
  if (!option) return [...providerCatalog.values()]
  const names = option.slice('--providers='.length).split(',').map((name) => name.trim().toLowerCase())
  const unknown = names.filter((name) => !providerCatalog.has(name))
  if (unknown.length) throw new Error(`Unknown providers: ${unknown.join(', ')}`)
  return names.map((name) => providerCatalog.get(name))
}

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
  length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])))
  return Buffer.concat([length, typeBytes, data, checksum])
}

function createGrayscalePng(width, height, pixelAt) {
  const raw = Buffer.alloc((width + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const row = y * (width + 1)
    raw[row] = 0
    for (let x = 0; x < width; x += 1) raw[row + x + 1] = pixelAt(x, y)
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

function makePrng(seed) {
  let state = seed >>> 0
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return state >>> 0
  }
}

async function createFixtures(runId) {
  await mkdir(fixtureDir, { recursive: true })
  const random = makePrng(Date.now())
  const definitions = [
    {
      kind: 'small', width: 1024, height: 768,
      bytes: createGrayscalePng(1024, 768, (x, y) => (x + y) & 0xff),
    },
    {
      kind: 'medium', width: 2500, height: 1800,
      bytes: createGrayscalePng(2500, 1800, () => random() & 0xf0),
    },
  ]
  const fixtures = []
  for (const definition of definitions) {
    const fileName = `gps-checker-test-${runId}-${definition.kind}.png`
    const filePath = join(fixtureDir, fileName)
    await writeFile(filePath, definition.bytes)
    fixtures.push({
      kind: definition.kind,
      width: definition.width,
      height: definition.height,
      fileName,
      filePath,
      mimeType: 'image/png',
      sizeBytes: definition.bytes.length,
      sha256: createHash('sha256').update(definition.bytes).digest('hex'),
    })
  }
  return fixtures
}

function contentLength(headers) {
  const value = Number(headers.get('content-length'))
  return Number.isFinite(value) && value >= 0 ? value : null
}

async function inspectDirectUrl(url, fixture) {
  const result = {
    url,
    head: null,
    firstGet: null,
    secondGet: null,
    opens: false,
    repeatGet: false,
    directImage: false,
    exactSize: false,
    exactContent: false,
    warnings: [],
    error: null,
  }
  try {
    const headStarted = performance.now()
    const head = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': USER_AGENT, Accept: 'image/*, */*;q=0.1' },
      redirect: 'follow',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    result.head = {
      status: head.status,
      contentType: head.headers.get('content-type'),
      contentLength: contentLength(head.headers),
      responseTimeMs: Math.round(performance.now() - headStarted),
      finalUrl: head.url,
    }

    for (const key of ['firstGet', 'secondGet']) {
      const started = performance.now()
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'image/*, */*;q=0.1' },
        redirect: 'follow',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      const bytes = Buffer.from(await response.arrayBuffer())
      const textSample = bytes.subarray(0, 8_192).toString('utf8')
      const block = looksBlockedOrHtml(textSample, response.headers.get('content-type') ?? '')
      result[key] = {
        status: response.status,
        contentType: response.headers.get('content-type'),
        contentLength: contentLength(response.headers),
        receivedBytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        responseTimeMs: Math.round(performance.now() - started),
        finalUrl: response.url,
        html: block.html,
        captcha: response.status >= 400 && block.captcha,
        cloudflareChallenge: block.challenge,
      }
    }

    result.opens = result.firstGet.status === 200 && !result.firstGet.html
    result.repeatGet = result.opens && result.secondGet.status === 200 && !result.secondGet.html
    result.directImage = result.repeatGet
      && result.firstGet.contentType?.toLowerCase().startsWith('image/') === true
      && result.secondGet.contentType?.toLowerCase().startsWith('image/') === true
    result.exactSize = result.firstGet.receivedBytes === fixture.sizeBytes
      && result.secondGet.receivedBytes === fixture.sizeBytes
    result.exactContent = result.firstGet.sha256 === fixture.sha256
      && result.secondGet.sha256 === fixture.sha256
    if (!result.head || result.head.status >= 400) result.warnings.push('HEAD was not successful.')
    if (!result.directImage) result.warnings.push('Returned URL is not a reusable direct image response.')
    if (!result.exactSize) result.warnings.push('Downloaded byte length differs from the uploaded file.')
    if (!result.exactContent) result.warnings.push('Downloaded content hash differs from the uploaded file.')
  } catch (error) {
    result.error = error.message
    result.warnings.push(`URL verification failed: ${error.message}`)
  }
  return result
}

async function inspectShareUrl(url) {
  if (!url) return null
  const result = { url, firstGet: null, secondGet: null, opens: false, repeatGet: false, error: null }
  try {
    for (const key of ['firstGet', 'secondGet']) {
      const started = performance.now()
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html, */*;q=0.1' },
        redirect: 'follow',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      const body = await response.text()
      const block = looksBlockedOrHtml(body, response.headers.get('content-type') ?? '')
      result[key] = {
        status: response.status,
        contentType: response.headers.get('content-type'),
        responseTimeMs: Math.round(performance.now() - started),
        finalUrl: response.url,
        html: block.html,
        captcha: response.status >= 400 && block.captcha,
        cloudflareChallenge: block.challenge,
      }
    }
    result.opens = result.firstGet.status === 200 && !result.firstGet.cloudflareChallenge
    result.repeatGet = result.opens && result.secondGet.status === 200
      && !result.secondGet.cloudflareChallenge
    return result
  } catch (error) {
    result.error = error.message
    return result
  }
}

function verdictFor(provider) {
  const successful = provider.uploads.filter((item) => item.ok)
  if (successful.length === 0) return { result: 'FAIL', suitable: 'no' }
  const allVerified = successful.length === provider.uploads.length
    && successful.every((item) => item.verification?.repeatGet || item.shareUrlVerification?.repeatGet)
  if (allVerified && !provider.forcePartial) return { result: 'PASS', suitable: 'yes' }
  return { result: 'PARTIAL', suitable: 'partial' }
}

function yesNo(value) {
  return value ? 'yes' : 'no'
}

function markdownReport(report) {
  const lines = [
    '# Image Host Lab Report',
    '',
    `Дата/время: ${report.generatedAt}`,
    `Commit: ${report.commit}`,
    `Node version: ${report.nodeVersion}`,
    '',
    '## Summary',
    '',
    '| Provider | Result | Upload | Public URL | Direct image | Repeat GET | Account/key | Verdict |',
    '|---|---|---|---|---|---|---|---|',
  ]
  for (const provider of report.providers) {
    const successful = provider.uploads.filter((item) => item.ok)
    const publicUrl = successful.length > 0 && successful.every((item) => Boolean(item.url))
    const direct = successful.length > 0 && successful.every((item) => item.verification?.directImage)
    const repeat = successful.length > 0 && successful.every((item) => item.verification?.repeatGet || item.shareUrlVerification?.repeatGet)
    lines.push(`| ${provider.provider} | ${provider.result} | ${successful.length}/${provider.uploads.length} | ${yesNo(publicUrl)} | ${yesNo(direct)} | ${yesNo(repeat)} | ${provider.accountOrKeyRequired ? 'required' : 'not required'} | ${provider.suitable} |`)
  }
  lines.push('', '## Provider details', '')
  for (const provider of report.providers) {
    const successful = provider.uploads.filter((item) => item.ok)
    const urls = successful.map((item) => item.url).filter(Boolean).join(', ') || 'none'
    const verification = successful.map((item) => item.verification)
    const measurements = provider.uploads.map((item, index) => {
      const label = report.fixtures[index]?.kind ?? `file ${index + 1}`
      const checks = item.verification
        ? `HEAD ${item.verification.head?.responseTimeMs ?? 'error'} ms; GET ${item.verification.firstGet?.responseTimeMs ?? 'error'}/${item.verification.secondGet?.responseTimeMs ?? 'error'} ms`
        : item.shareUrlVerification
          ? `share GET ${item.shareUrlVerification.firstGet?.responseTimeMs ?? 'error'}/${item.shareUrlVerification.secondGet?.responseTimeMs ?? 'error'} ms`
          : 'URL checks not available'
      return `${label}: ${item.sizeBytes} bytes, upload ${item.responseTimeMs} ms, ${checks}`
    }).join('; ')
    const warnings = [...new Set([
      ...provider.notes,
      ...provider.uploads.flatMap((item) => item.warnings ?? []),
      ...verification.flatMap((item) => item?.warnings ?? []),
    ])]
    lines.push(
      `### ${provider.provider}`,
      '',
      `- Upload result: ${successful.length}/${provider.uploads.length} successful (${provider.uploads.map((item) => item.uploadStatus ?? 'network error').join(', ')})`,
      `- Returned URL: ${urls}`,
      `- GET result: ${verification.length ? verification.map((item) => item ? `${item.firstGet?.status ?? 'error'}/${item.secondGet?.status ?? 'error'}` : 'not tested').join(', ') : 'not tested'}`,
      `- Share page GET: ${successful.length ? successful.map((item) => item.shareUrlVerification ? `${item.shareUrlVerification.firstGet?.status ?? 'error'}/${item.shareUrlVerification.secondGet?.status ?? 'error'}` : 'same as direct URL or not tested').join(', ') : 'not tested'}`,
      `- Direct image: ${successful.length > 0 && verification.every((item) => item?.directImage) ? 'yes' : 'no'}`,
      `- Measurements: ${measurements}`,
      `- Retention: ${provider.retention}`,
      `- Metadata/EXIF: NOT_TESTED (fixtures intentionally contain no EXIF); byte-for-byte integrity: ${successful.length > 0 && verification.every((item) => item?.exactContent) ? 'preserved' : 'not verified'}`,
      `- Warnings: ${warnings.join(' ') || 'none'}`,
      `- Final verdict: ${provider.result}`,
      `- Suitable for GPS Checker: ${provider.suitable}`,
      '',
    )
  }
  lines.push(
    '## Recommendation',
    '',
    `1. Лучший кандидат: ${report.recommendation.best}.`,
    `2. Второй кандидат: ${report.recommendation.second}.`,
    `3. Не использовать: ${report.recommendation.avoid}.`,
    `4. Что нужно сделать дальше: ${report.recommendation.next}`,
    '',
  )
  return lines.join('\n')
}

async function main() {
  const providers = selectedProviders()
  const runId = new Date().toISOString().replace(/[-:.TZ]/g, '')
  await mkdir(resultsDir, { recursive: true })
  const fixtures = await createFixtures(runId)
  const medium = fixtures.find((item) => item.kind === 'medium')
  if (medium.sizeBytes < 1_000_000 || medium.sizeBytes > 3_500_000) {
    throw new Error(`Generated medium fixture is outside the intended 1–3 MB range: ${medium.sizeBytes} bytes`)
  }

  console.log(`Created fixtures: ${fixtures.map((item) => `${item.kind}=${item.sizeBytes} bytes`).join(', ')}`)
  const providerResults = []
  for (const adapter of providers) {
    console.log(`\nTesting ${adapter.providerInfo.name} (2 uploads maximum)...`)
    const uploads = []
    for (const fixture of fixtures) {
      const upload = await adapter.upload(fixture)
      console.log(`  ${fixture.kind}: HTTP ${upload.uploadStatus ?? 'network error'}, ${upload.ok ? 'uploaded' : upload.error}`)
      if (upload.ok && upload.directImageUrl) {
        upload.verification = await inspectDirectUrl(upload.directImageUrl, fixture)
        if (upload.url && upload.url !== upload.directImageUrl) {
          upload.shareUrlVerification = await inspectShareUrl(upload.url)
        }
        console.log(`    direct GET/GET: ${upload.verification.firstGet?.status ?? 'error'}/${upload.verification.secondGet?.status ?? 'error'}, direct=${upload.verification.directImage}`)
      } else if (upload.ok && upload.url) {
        upload.verification = null
        upload.shareUrlVerification = await inspectShareUrl(upload.url)
        console.log(`    share GET/GET: ${upload.shareUrlVerification.firstGet?.status ?? 'error'}/${upload.shareUrlVerification.secondGet?.status ?? 'error'}, direct=false`)
      } else {
        upload.verification = null
      }
      uploads.push(upload)
    }
    const provider = { ...adapter.providerInfo, provider: adapter.providerInfo.name, uploads }
    Object.assign(provider, verdictFor(provider))
    providerResults.push(provider)
  }

  const directCount = (provider) => provider.uploads.filter((upload) => upload.verification?.directImage).length
  const ranked = [
    ...providerResults.filter((provider) => provider.result === 'PASS').sort((a, b) => directCount(b) - directCount(a) || (a.recommendationRank ?? 999) - (b.recommendationRank ?? 999)),
    ...providerResults.filter((provider) => provider.result === 'PARTIAL'),
  ]
  const best = ranked[0]?.provider ?? 'none'
  const second = ranked[1]?.provider ?? 'none'
  const avoid = providerResults.filter((provider) => provider.result === 'FAIL').map((provider) => provider.provider).join(', ') || 'none'
  const bestResult = providerResults.find((provider) => provider.provider === best)?.result
  const report = {
    generatedAt: new Date().toISOString(),
    commit: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8', cwd: join(labDir, '../..') }).trim(),
    nodeVersion: process.version,
    fixturePolicy: 'Synthetic PNG files only; no user photos or personal data.',
    fixtures: fixtures.map(({ filePath, ...fixture }) => fixture),
    metadataCheck: 'NOT_TESTED (synthetic fixtures contain no EXIF/GPS metadata)',
    providers: providerResults,
    recommendation: {
      best,
      second,
      avoid,
      next: best === 'none'
        ? 'Do not integrate any provider; evaluate another host or a controlled storage service.'
        : bestResult === 'PASS'
          ? `Before production integration, repeat from the deployed Cloudflare Worker egress and review ${best} usage/privacy terms.`
          : `${best} is only PARTIAL; do not integrate it as a direct image host without resolving the documented blocker.`,
    },
  }

  await writeFile(join(resultsDir, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`)
  await writeFile(join(resultsDir, 'latest.md'), markdownReport(report))
  console.log(`\nReports written to ${join(resultsDir, 'latest.json')} and latest.md`)
  console.log(providerResults.map((provider) => `${provider.provider}: ${provider.result}`).join('\n'))

  for (const fixture of fixtures) await rm(fixture.filePath, { force: true })
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
