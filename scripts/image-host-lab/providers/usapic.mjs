import { readFile } from 'node:fs/promises'
import {
  elapsedMs,
  failedUpload,
  isPublicHttpUrl,
  REQUEST_TIMEOUT_MS,
  successfulUpload,
  USER_AGENT,
} from '../lib/provider-utils.mjs'

export const providerInfo = {
  name: 'USApic',
  recommendationRank: 3,
  accountOrKeyRequired: false,
  retention: 'The anonymous form is configured to auto-delete after 6 months.',
  notes: ['The public web uploader supports anonymous multipart uploads and returns share and direct links.'],
}

function cookies(response) {
  return response.headers.getSetCookie?.().map((item) => item.split(';')[0]).join('; ') ?? ''
}

export async function upload(file) {
  const startedAt = performance.now()
  let response = null
  let responseText = ''
  try {
    const page = await fetch('https://usapic.cc/ru', {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const pageText = await page.text()
    const csrf = pageText.match(/<meta name="csrf-token" content="([^"]+)"/)?.[1]
    if (!page.ok || !csrf) {
      return failedUpload({ provider: providerInfo.name, response: page, responseText: pageText, responseTimeMs: elapsedMs(startedAt), contentType: file.mimeType, sizeBytes: file.sizeBytes }, 'Could not initialize the anonymous upload session.')
    }
    const bytes = await readFile(file.filePath)
    const form = new FormData()
    form.append('file', new Blob([bytes], { type: file.mimeType }), file.fileName)
    form.append('size', String(file.sizeBytes))
    form.append('type', file.mimeType)
    form.append('password', '')
    form.append('upload_auto_delete', '22')
    response = await fetch('https://usapic.cc/upload', {
      method: 'POST',
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', 'X-CSRF-TOKEN': csrf, 'X-Requested-With': 'XMLHttpRequest', Cookie: cookies(page) },
      body: form,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    responseText = await response.text()
  } catch (error) {
    return failedUpload({ provider: providerInfo.name, response, responseText, responseTimeMs: elapsedMs(startedAt), contentType: file.mimeType, sizeBytes: file.sizeBytes }, error.message)
  }
  const base = { provider: providerInfo.name, response, responseText, responseTimeMs: elapsedMs(startedAt), contentType: file.mimeType, sizeBytes: file.sizeBytes }
  let payload = null
  try { payload = JSON.parse(responseText) } catch { /* handled below */ }
  const url = payload?.file_link ?? null
  const directImageUrl = payload?.direct_link ?? null
  if (!response.ok || payload?.type !== 'success' || !isPublicHttpUrl(url)) {
    return failedUpload(base, payload?.msg ?? `Anonymous form upload failed (HTTP ${response.status}).`)
  }
  return successfulUpload(base, { url, directImageUrl: isPublicHttpUrl(directImageUrl) ? directImageUrl : null })
}
