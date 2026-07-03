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
  name: 'Files.fm',
  recommendationRank: 4,
  accountOrKeyRequired: false,
  retention: 'The anonymous form offers up to 62 days; this lab requests 62 days.',
  notes: ['The REST API requires an account, but api.files.fm exposes an anonymous browser upload flow.'],
}

function cookies(response) {
  return response.headers.getSetCookie?.().map((item) => item.split(';')[0]).join('; ') ?? ''
}

export async function upload(file) {
  const startedAt = performance.now()
  let response = null
  let responseText = ''
  try {
    const page = await fetch('https://api.files.fm/', {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const pageText = await page.text()
    const cookie = cookies(page)
    const sessionId = cookie.match(/PHPSESSID=([^;]+)/)?.[1]
      ?? pageText.match(/var PHPSESSID = '([^']+)'/)?.[1]
    if (!page.ok || !sessionId) {
      return failedUpload({ provider: providerInfo.name, response: page, responseText: pageText, responseTimeMs: elapsedMs(startedAt), contentType: file.mimeType, sizeBytes: file.sizeBytes }, `Could not initialize anonymous upload session (HTTP ${page.status}).`)
    }

    const idResponse = await fetch('https://api.files.fm/server_scripts/get_upload_id.php?show_add_key=1&source=web_first_page', {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/plain', Cookie: cookie },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const idText = await idResponse.text()
    const [uploadHash, deleteKey, addKey] = idText.trim().split(',')
    if (!idResponse.ok || !uploadHash || !addKey) {
      return failedUpload({ provider: providerInfo.name, response: idResponse, responseText: idText, responseTimeMs: elapsedMs(startedAt), contentType: file.mimeType, sizeBytes: file.sizeBytes }, 'Anonymous form did not issue an upload id.')
    }

    const bytes = await readFile(file.filePath)
    const form = new FormData()
    form.append('Filedata', new Blob([bytes], { type: file.mimeType }), file.fileName)
    form.append('UserAgent', JSON.stringify({ app: USER_AGENT }))
    const uploadUrl = new URL('https://ano.files.fm/save_file.php')
    uploadUrl.search = new URLSearchParams({ PHPSESSID: sessionId, up_id: uploadHash, ignore_user_abort: '1', skip_update: '1', key: addKey })
    response = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'User-Agent': USER_AGENT, Accept: '*/*', Cookie: cookie },
      body: form,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    responseText = await response.text()
    if (!response.ok) {
      return failedUpload({ provider: providerInfo.name, response, responseText, responseTimeMs: elapsedMs(startedAt), contentType: file.mimeType, sizeBytes: file.sizeBytes }, `Anonymous file upload failed (HTTP ${response.status}).`)
    }

    await fetch(`https://ano.files.fm/finish_upload.php?upload_hash=${encodeURIComponent(uploadHash)}&PHPSESSID=${encodeURIComponent(sessionId)}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', Cookie: cookie },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    const settings = new URLSearchParams()
    settings.set('upload_data[upload_hash]', uploadHash)
    settings.set('upload_data[del_key]', deleteKey ?? '')
    settings.set('upload_data[access_type]', 'LINK')
    settings.set('upload_data[set_as_public_checkbox_checked]', 'false')
    settings.set('upload_data[display_name]', file.fileName)
    settings.set('upload_data[days_to_save_files]', '62')
    settings.set('upload_data[me]', '')
    settings.set('upload_data[e]', '')
    const retentionResponse = await fetch(`https://api.files.fm/ajax/after_upload_save.php?PHPSESSID=${encodeURIComponent(sessionId)}`, {
      method: 'POST',
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', Cookie: cookie },
      body: settings,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    const url = `https://api.files.fm/u/${uploadHash}`
    const base = { provider: providerInfo.name, response, responseText, responseTimeMs: elapsedMs(startedAt), contentType: file.mimeType, sizeBytes: file.sizeBytes }
    if (!isPublicHttpUrl(url)) return failedUpload(base, 'Upload completed without a public URL.')
    const warnings = ['The anonymous flow returned a public folder URL, not a direct image URL.']
    if (!retentionResponse.ok) warnings.push(`The 62-day retention request was not confirmed (HTTP ${retentionResponse.status}).`)
    return successfulUpload(base, { url, directImageUrl: null, warnings, extra: { responseSnippet: 'File upload accepted; management keys intentionally omitted.' } })
  } catch (error) {
    return failedUpload({ provider: providerInfo.name, response, responseText, responseTimeMs: elapsedMs(startedAt), contentType: file.mimeType, sizeBytes: file.sizeBytes }, error.message)
  }
}
