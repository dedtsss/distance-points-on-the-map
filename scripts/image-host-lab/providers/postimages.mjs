import {
  failedUpload,
  isPublicHttpUrl,
  looksBlockedOrHtml,
  successfulUpload,
  uploadMultipart,
} from '../lib/provider-utils.mjs'

export const providerInfo = {
  name: 'Postimages',
  accountOrKeyRequired: true,
  retention: 'No expiration requested; the public form advertises permanent links.',
  notes: ['Automated API access requires an account; the anonymous public form endpoint rejects automated uploads.'],
}

export async function upload(file) {
  const base = await uploadMultipart({
    provider: providerInfo.name,
    endpoint: 'https://postimages.org/json',
    ...file,
    fields: {
      gallery: '',
      optsize: 0,
      expire: 0,
      numfiles: 1,
      upload_session: `${Date.now()}${Math.random().toString().slice(2)}`,
    },
    headers: { 'X-Requested-With': 'XMLHttpRequest', 'Cache-Control': 'no-cache' },
  })
  if (base.requestError) return failedUpload(base, base.requestError.message)
  let payload = null
  try { payload = JSON.parse(base.responseText) } catch { /* handled below */ }
  const url = payload?.url ?? null
  const directImageUrl = payload?.image ?? null
  const block = looksBlockedOrHtml(base.responseText, base.response.headers.get('content-type') ?? '')
  if (!base.response.ok || !isPublicHttpUrl(url) || block.challenge || block.captcha) {
    return failedUpload(base, payload?.error?.message ?? payload?.error ?? `Anonymous form upload failed (HTTP ${base.response.status}).`)
  }
  const warnings = isPublicHttpUrl(directImageUrl) ? [] : ['Upload returned a public page but no direct image URL.']
  return successfulUpload(base, { url, directImageUrl: isPublicHttpUrl(directImageUrl) ? directImageUrl : null, warnings })
}
