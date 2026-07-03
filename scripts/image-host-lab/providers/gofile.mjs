import {
  failedUpload,
  isPublicHttpUrl,
  looksBlockedOrHtml,
  successfulUpload,
  uploadMultipart,
} from '../lib/provider-utils.mjs'

export const providerInfo = {
  name: 'Gofile',
  accountOrKeyRequired: false,
  retention: 'Guest/free content defaults to 10 days and can last longer while actively downloaded.',
  forcePartial: true,
  notes: [
    'Guest upload is supported without an account or token.',
    'Official direct links for embedding/integrations are a Premium feature; guest upload normally returns a download page.',
  ],
}

export async function upload(file) {
  const base = await uploadMultipart({
    provider: providerInfo.name,
    endpoint: 'https://upload.gofile.io/uploadfile',
    ...file,
  })
  if (base.requestError) return failedUpload(base, base.requestError.message)

  const block = looksBlockedOrHtml(
    base.responseText,
    base.response.headers.get('content-type') ?? '',
  )
  let payload = null
  try { payload = JSON.parse(base.responseText) } catch { /* Report malformed responses below. */ }

  const data = payload?.data ?? {}
  const url = data.downloadPage ?? data.downloadPageUrl ?? null
  const directImageUrl = data.directLink ?? data.directUrl ?? null
  const warnings = []
  if (block.captcha) warnings.push('Upload response contains CAPTCHA indicators.')
  if (block.challenge) warnings.push('Upload response contains Cloudflare/challenge indicators.')
  if (url && !directImageUrl) warnings.push('Upload returned a public download page, not a direct image URL.')

  const success = base.response.ok
    && (payload?.status === 'ok' || payload?.status === 'success' || payload?.success === true)
    && isPublicHttpUrl(url)
    && !block.blocked
  if (!success) {
    return failedUpload(
      base,
      payload?.message ?? `Guest upload did not return a usable public page (HTTP ${base.response.status}).`,
      warnings,
    )
  }

  const { guestToken: _guestToken, ...safeResponseData } = data
  return successfulUpload(base, {
    url,
    directImageUrl,
    warnings,
    extra: {
      folderId: data.folderId ?? data.parentFolder ?? null,
      fileId: data.fileId ?? data.id ?? null,
      guestManagementTokenReturned: Boolean(data.guestToken),
      responseSnippet: JSON.stringify({ status: payload.status, data: safeResponseData }).slice(0, 500),
    },
  })
}
