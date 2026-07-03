import { readFile } from 'node:fs/promises'
import {
  elapsedMs,
  failedUpload,
  looksBlockedOrHtml,
  REQUEST_TIMEOUT_MS,
  successfulUpload,
  USER_AGENT,
} from '../lib/provider-utils.mjs'

export const providerInfo = {
  name: 'Pixeldrain',
  accountOrKeyRequired: true,
  retention: '60 days after the last qualifying download on the free sharing service.',
  notes: [
    'Current API documentation says uploads require an account and API key.',
    'Direct downloads can be rate-limited; CAPTCHA is served on the viewer page and hotlinking is restricted.',
  ],
}

export async function upload(file) {
  const startedAt = performance.now()
  let response
  let responseText = ''
  try {
    const bytes = await readFile(file.filePath)
    response = await fetch(`https://pixeldrain.com/api/file/${encodeURIComponent(file.fileName)}`, {
      method: 'PUT',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        'Content-Type': file.mimeType,
      },
      body: bytes,
      redirect: 'follow',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    responseText = await response.text()
  } catch (error) {
    return failedUpload({
      provider: providerInfo.name,
      response: null,
      responseText,
      responseTimeMs: elapsedMs(startedAt),
      contentType: file.mimeType,
      sizeBytes: file.sizeBytes,
    }, error.message, ['Anonymous PUT was attempted without credentials.'])
  }

  const base = {
    provider: providerInfo.name,
    response,
    responseText,
    responseTimeMs: elapsedMs(startedAt),
    contentType: file.mimeType,
    sizeBytes: file.sizeBytes,
  }
  const block = looksBlockedOrHtml(responseText, response.headers.get('content-type') ?? '')
  let payload = null
  try { payload = JSON.parse(responseText) } catch { /* Report malformed/non-JSON responses below. */ }

  const warnings = ['Anonymous PUT was attempted without an account or API key.']
  if (payload?.value === 'authentication_required') {
    warnings.push('Pixeldrain explicitly rejected the upload because authentication is required.')
  }
  if (block.captcha) warnings.push('Upload response contains CAPTCHA indicators.')
  if (block.challenge) warnings.push('Upload response contains Cloudflare/challenge indicators.')

  if (!response.ok || !payload?.success || !payload.id) {
    return failedUpload(
      base,
      payload?.message ?? `Anonymous upload failed (HTTP ${response.status}).`,
      warnings,
    )
  }

  const shareUrl = `https://pixeldrain.com/u/${payload.id}`
  const directImageUrl = `https://pixeldrain.com/api/file/${payload.id}`
  return successfulUpload(base, {
    url: shareUrl,
    directImageUrl,
    warnings,
    extra: {
      shareUrl,
      thumbnailUrl: `https://pixeldrain.com/api/file/${payload.id}/thumbnail`,
      fileId: payload.id,
    },
  })
}
