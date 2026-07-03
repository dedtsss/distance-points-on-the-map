import {
  failedUpload,
  isPublicHttpUrl,
  looksBlockedOrHtml,
  successfulUpload,
  uploadMultipart,
} from '../lib/provider-utils.mjs'

export const providerInfo = {
  name: '0x0.st',
  accountOrKeyRequired: false,
  retention: 'Requested 180 days; host documents 30 days to 1 year depending on file size.',
  notes: ['Public single-operator service; not suitable for confidential or mass automated uploads.'],
}

export async function upload(file) {
  const base = await uploadMultipart({
    provider: providerInfo.name,
    endpoint: 'https://0x0.st',
    ...file,
    fields: { expires: 24 * 180 },
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
  if (block.html) warnings.push('Upload response is HTML instead of a plain-text URL.')
  if (/uploads disabled/i.test(base.responseText)) {
    warnings.push('The service explicitly reports that uploads are currently disabled with no ETA.')
  }

  if (!base.response.ok || block.blocked || !isPublicHttpUrl(url)) {
    return failedUpload(
      base,
      `Upload did not return a usable public URL (HTTP ${base.response.status}).`,
      warnings,
    )
  }
  return successfulUpload(base, { url, warnings })
}
