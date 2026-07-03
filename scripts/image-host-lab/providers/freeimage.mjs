import { readFile } from 'node:fs/promises'
import {
  elapsedMs,
  failedUpload,
  isPublicHttpUrl,
  looksBlockedOrHtml,
  REQUEST_TIMEOUT_MS,
  successfulUpload,
  USER_AGENT,
} from '../lib/provider-utils.mjs'

export const providerInfo = {
  name: 'Freeimage.host',
  recommendationRank: 1,
  accountOrKeyRequired: false,
  retention: 'No auto-delete requested; the anonymous form defaults to no expiration.',
  notes: ['The documented API requires a key, but the public web uploader supports anonymous uploads.'],
}

function cookies(response) {
  return response.headers.getSetCookie?.().map((item) => item.split(';')[0]).join('; ') ?? ''
}

export async function upload(file) {
  const startedAt = performance.now()
  let response = null
  let responseText = ''
  try {
    const page = await fetch('https://freeimage.host/', {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const pageText = await page.text()
    const authToken = pageText.match(/PF\.obj\.config\.auth_token\s*=\s*"([^"]+)"/)?.[1]
    if (!page.ok || !authToken) {
      return failedUpload({ provider: providerInfo.name, response: page, responseText: pageText, responseTimeMs: elapsedMs(startedAt), contentType: file.mimeType, sizeBytes: file.sizeBytes }, 'Could not initialize the anonymous web upload session.')
    }

    const bytes = await readFile(file.filePath)
    const form = new FormData()
    form.append('source', new Blob([bytes], { type: file.mimeType }), file.fileName)
    form.append('type', 'file')
    form.append('action', 'upload')
    form.append('privacy', 'public')
    form.append('timestamp', String(Date.now()))
    form.append('auth_token', authToken)
    response = await fetch('https://freeimage.host/json', {
      method: 'POST',
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', Cookie: cookies(page) },
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
  const url = payload?.image?.url_viewer ?? null
  const directImageUrl = payload?.image?.url ?? payload?.image?.display_url ?? null
  const block = looksBlockedOrHtml(responseText, response.headers.get('content-type') ?? '')
  if (!response.ok || !isPublicHttpUrl(url) || !isPublicHttpUrl(directImageUrl) || block.blocked) {
    return failedUpload(base, payload?.error?.message ?? `Anonymous form upload failed (HTTP ${response.status}).`)
  }
  return successfulUpload(base, { url, directImageUrl, extra: { responseSnippet: JSON.stringify({ status_code: payload.status_code, status_txt: payload.status_txt, image: { url, url_viewer: url, direct_url: directImageUrl, size: payload.image?.size, mime: payload.image?.mime } }) } })
}
