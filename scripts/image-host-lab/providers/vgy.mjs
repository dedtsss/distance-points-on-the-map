import {
  failedUpload,
  isPublicHttpUrl,
  looksBlockedOrHtml,
  successfulUpload,
  uploadMultipart,
} from '../lib/provider-utils.mjs'

export const providerInfo = {
  name: 'vgy.me',
  accountOrKeyRequired: true,
  retention: 'No fixed retention period is stated in the public API or terms.',
  notes: [
    'The public API page documents anonymous multipart uploads, but the live endpoint currently requires authorization.',
    'Mass uploads without prior approval are prohibited; this lab sends only two files.',
  ],
}

export async function upload(file) {
  const base = await uploadMultipart({
    provider: providerInfo.name,
    endpoint: 'https://vgy.me/upload',
    ...file,
  })
  if (base.requestError) return failedUpload(base, base.requestError.message)

  const block = looksBlockedOrHtml(
    base.responseText,
    base.response.headers.get('content-type') ?? '',
  )
  let payload = null
  try { payload = JSON.parse(base.responseText) } catch { /* Report malformed responses below. */ }
  const url = payload?.url ?? null
  const directImageUrl = payload?.image ?? null
  const warnings = []
  if (block.captcha) warnings.push('Upload response contains CAPTCHA indicators.')
  if (block.challenge) warnings.push('Upload response contains Cloudflare/challenge indicators.')
  if (url && !directImageUrl) warnings.push('Upload returned no direct image URL.')
  if (payload?.messages?.Unauthorized) {
    warnings.push('The live endpoint rejected anonymous upload and requires an account user key.')
  }

  if (!base.response.ok || payload?.error !== false || !isPublicHttpUrl(url) || !isPublicHttpUrl(directImageUrl) || block.blocked) {
    const detail = payload?.messages ? JSON.stringify(payload.messages) : payload?.message
    return failedUpload(
      base,
      detail ?? `Anonymous upload did not return share and direct image URLs (HTTP ${base.response.status}).`,
      warnings,
    )
  }

  return successfulUpload(base, {
    url,
    directImageUrl,
    warnings,
    extra: {
      deletionUrl: payload.delete ?? null,
      returnedFileSize: payload.filesize ?? null,
    },
  })
}
