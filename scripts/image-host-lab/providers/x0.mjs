import {
  failedUpload,
  isPublicHttpUrl,
  looksBlockedOrHtml,
  successfulUpload,
  uploadMultipart,
} from '../lib/provider-utils.mjs'

export const providerInfo = {
  name: 'x0.at',
  accountOrKeyRequired: false,
  retention: '3 to 100 days depending on file size; small image files should be near the upper bound.',
  notes: ['Retention is size-dependent and cannot be requested explicitly.'],
}

export async function upload(file) {
  const base = await uploadMultipart({
    provider: providerInfo.name,
    endpoint: 'https://x0.at/',
    ...file,
    fields: { id_length: 12 },
  })
  if (base.requestError) return failedUpload(base, base.requestError.message)

  const block = looksBlockedOrHtml(
    base.responseText,
    base.response.headers.get('content-type') ?? '',
  )
  const url = base.responseText.trim().split(/\s+/)[0]
  const warnings = []
  if (block.captcha) warnings.push('Upload response contains CAPTCHA indicators.')
  if (block.challenge) warnings.push('Upload response contains Cloudflare/challenge indicators.')
  if (block.html) warnings.push('Upload response declares text/html even though its body is a plain-text URL.')
  const containsHtmlMarkup = /<!doctype html|<html[\s>]|<body[\s>]/i.test(base.responseText)

  if (!base.response.ok || block.captcha || block.challenge || containsHtmlMarkup || !isPublicHttpUrl(url)) {
    return failedUpload(
      base,
      `Upload did not return a usable public URL (HTTP ${base.response.status}).`,
      warnings,
    )
  }
  return successfulUpload(base, { url, warnings })
}
