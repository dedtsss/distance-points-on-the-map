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
  name: 'Imgbox',
  recommendationRank: 2,
  accountOrKeyRequired: false,
  retention: 'The official help page states that images are stored for their lifetime.',
  notes: ['Anonymous uploads and original-image hotlinking are officially supported.'],
}

function cookies(response) {
  return response.headers.getSetCookie?.().map((item) => item.split(';')[0]).join('; ') ?? ''
}

export async function upload(file) {
  const startedAt = performance.now()
  let response = null
  let responseText = ''
  try {
    const page = await fetch('https://imgbox.com/', {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const pageText = await page.text()
    const csrf = pageText.match(/input name="authenticity_token" type="hidden" value="([^"]+)"/)?.[1]
    const cookie = cookies(page)
    if (!page.ok || !csrf || !cookie) {
      return failedUpload({ provider: providerInfo.name, response: page, responseText: pageText, responseTimeMs: elapsedMs(startedAt), contentType: file.mimeType, sizeBytes: file.sizeBytes }, `Could not initialize the anonymous form session (HTTP ${page.status}).`)
    }

    const tokenResponse = await fetch('https://imgbox.com/ajax/token/generate', {
      method: 'POST',
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-CSRF-Token': csrf, 'X-Requested-With': 'XMLHttpRequest', Cookie: `${cookie}; request_method=POST` },
      body: new URLSearchParams({ gallery: 'true', gallery_title: `gps-checker-test-${Date.now()}`, comments_enabled: '0' }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const tokenText = await tokenResponse.text()
    let token = null
    try { token = JSON.parse(tokenText) } catch { /* handled below */ }
    if (!tokenResponse.ok || !token?.token_id || !token?.token_secret) {
      return failedUpload({ provider: providerInfo.name, response: tokenResponse, responseText: tokenText, responseTimeMs: elapsedMs(startedAt), contentType: file.mimeType, sizeBytes: file.sizeBytes }, `Could not obtain an anonymous upload token (HTTP ${tokenResponse.status}).`)
    }

    const bytes = await readFile(file.filePath)
    const form = new FormData()
    form.append('token_id', String(token.token_id))
    form.append('token_secret', token.token_secret)
    form.append('content_type', '1')
    form.append('thumbnail_size', '100c')
    form.append('gallery_id', token.gallery_id)
    form.append('gallery_secret', token.gallery_secret)
    form.append('comments_enabled', '0')
    form.append('files[]', new Blob([bytes], { type: file.mimeType }), file.fileName)
    response = await fetch('https://imgbox.com/upload/process', {
      method: 'POST',
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', 'X-CSRF-Token': csrf, 'X-Requested-With': 'XMLHttpRequest', Cookie: `${cookie}; request_method=POST`, Origin: 'https://imgbox.com', Referer: 'https://imgbox.com/' },
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
  const uploaded = payload?.files?.[0]
  const url = uploaded?.url ?? null
  const directImageUrl = uploaded?.original_url ?? null
  if (!response.ok || !isPublicHttpUrl(url) || !isPublicHttpUrl(directImageUrl)) {
    return failedUpload(base, payload?.message ?? `Anonymous form upload failed (HTTP ${response.status}).`)
  }
  return successfulUpload(base, { url, directImageUrl, extra: { responseSnippet: JSON.stringify({ files: [{ url, original_url: directImageUrl, name: uploaded.name }] }) } })
}
