import {
  failedUpload,
  isPublicHttpUrl,
  looksBlockedOrHtml,
  successfulUpload,
  uploadMultipart,
} from '../lib/provider-utils.mjs'

export const providerInfo = {
  name: 'Bashify',
  accountOrKeyRequired: false,
  retention: 'The form offers 6 months or 1 year; this lab requests 6 months.',
  notes: [
    'Uploads are advertised as anonymous, but the web upload flow requires a reCAPTCHA v3 token.',
    'The FAQ states that direct image access is referrer-dependent.',
  ],
}

export async function upload(file) {
  const base = await uploadMultipart({
    provider: providerInfo.name,
    endpoint: 'https://bashify.io/images/upload',
    ...file,
    fields: {
      exposure: 0,
      resize: 0,
      expires: 6,
      bg: '1d1e1d',
      is_options_opened: 1,
      password: '',
      email: '',
      keywords: 'gps-checker-test',
      encoded_filename: encodeURI(file.fileName),
      token: '',
    },
  })
  if (base.requestError) return failedUpload(base, base.requestError.message)

  const response = base.responseText.trim()
  const block = looksBlockedOrHtml(response, base.response.headers.get('content-type') ?? '')
  const warnings = ['No CAPTCHA token was supplied; the lab does not bypass anti-bot protection.']
  if (/ERROR_bot|captcha failed/i.test(response)) {
    warnings.push('Bashify rejected the automated upload because CAPTCHA validation failed.')
    return failedUpload(base, 'Automated upload requires a valid CAPTCHA token.', warnings)
  }

  let payload = null
  try { payload = JSON.parse(response) } catch { /* Report malformed responses below. */ }
  const code = payload?.short_url_code ?? payload?.long_url_code
  const url = code ? `https://bashify.io/i/${code}` : null
  if (block.captcha) warnings.push('Upload response contains CAPTCHA indicators.')
  if (block.challenge) warnings.push('Upload response contains Cloudflare/challenge indicators.')
  if (url) warnings.push('Only a viewer URL was returned; direct image access is referrer-protected.')

  if (!base.response.ok || !payload?.is_image || !isPublicHttpUrl(url) || block.challenge) {
    return failedUpload(
      base,
      `Upload did not return a usable image page (HTTP ${base.response.status}).`,
      warnings,
    )
  }
  return successfulUpload(base, {
    url,
    directImageUrl: null,
    warnings,
    extra: { deletionCode: payload.deletion_code ?? null },
  })
}
