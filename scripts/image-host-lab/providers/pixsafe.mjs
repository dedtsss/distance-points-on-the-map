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
  name: 'Pixsafe',
  recommendationRank: 5,
  accountOrKeyRequired: false,
  retention: 'Anonymous/standard albums can be configured for up to 30 days.',
  forcePartial: true,
  notes: ['Anonymous upload is supported, but the maximum free retention is below the preferred 60–180 day range.'],
}

function cookies(response) {
  return response.headers.getSetCookie?.().map((item) => item.split(';')[0]).join('; ') ?? ''
}

async function postForm(form, cookie) {
  const response = await fetch('https://pixsafe.online/index.php', {
    method: 'POST',
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', Cookie: cookie },
    body: form,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  return { response, text: await response.text() }
}

export async function upload(file) {
  const startedAt = performance.now()
  let response = null
  let responseText = ''
  try {
    const page = await fetch('https://pixsafe.online/', { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    const cookie = cookies(page)
    await page.arrayBuffer()
    const init = new FormData()
    init.append('action', 'init_upload')
    init.append('files', JSON.stringify([{ name: file.fileName, type: file.mimeType }]))
    init.append('retentionDays', '30')
    const initialized = await postForm(init, cookie)
    let initPayload = null
    try { initPayload = JSON.parse(initialized.text) } catch { /* handled below */ }
    if (!initialized.response.ok || initPayload?.error || !initPayload?.albumId) {
      return failedUpload({ provider: providerInfo.name, response: initialized.response, responseText: initialized.text, responseTimeMs: elapsedMs(startedAt), contentType: file.mimeType, sizeBytes: file.sizeBytes }, initPayload?.error ?? 'Could not initialize anonymous upload.')
    }

    const bytes = await readFile(file.filePath)
    let finalPayload = null
    if (initPayload.mode === 'direct') {
      const fileInfo = initPayload.files?.find((item) => item.originalName === file.fileName)
      if (!fileInfo?.uploadUrl) throw new Error('Pixsafe returned no direct upload URL.')
      const put = await fetch(fileInfo.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.mimeType, 'User-Agent': USER_AGENT }, body: bytes, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
      if (!put.ok) throw new Error(`Direct storage upload failed (HTTP ${put.status}).`)
      const complete = new FormData()
      complete.append('action', 'complete_upload')
      complete.append('data', JSON.stringify({ albumId: initPayload.albumId, files: [{ name: fileInfo.finalName, type: file.mimeType }] }))
      const completed = await postForm(complete, cookie)
      response = completed.response
      responseText = completed.text
      finalPayload = JSON.parse(responseText)
    } else {
      const chunkSize = 2 * 1024 * 1024
      const totalChunks = Math.ceil(bytes.length / chunkSize)
      for (let index = 0; index < totalChunks; index += 1) {
        const start = index * chunkSize
        const chunk = bytes.subarray(start, Math.min(start + chunkSize, bytes.length))
        const form = new FormData()
        form.append('files[]', new Blob([chunk], { type: file.mimeType }), file.fileName)
        form.append('albumId', initPayload.albumId)
        form.append('retentionDays', '30')
        form.append('isChunked', totalChunks > 1 ? 'true' : 'false')
        if (totalChunks > 1) {
          form.append('chunkIndex', String(index))
          form.append('totalChunks', String(totalChunks))
          form.append('originalName', file.fileName)
        }
        form.append('isLastBatch', index === totalChunks - 1 ? 'true' : 'false')
        const uploaded = await postForm(form, cookie)
        response = uploaded.response
        responseText = uploaded.text
        if (!response.ok) throw new Error(`Chunk upload failed (HTTP ${response.status}).`)
        try { finalPayload = JSON.parse(responseText) } catch { finalPayload = null }
      }
    }
    const url = finalPayload?.link ? new URL(finalPayload.link, 'https://pixsafe.online/').href : null
    let directImageUrl = null
    if (isPublicHttpUrl(url)) {
      const albumPage = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
      const albumHtml = await albumPage.text()
      directImageUrl = albumHtml.match(/src="(https:\/\/[^"\s]+\/albums\/[^"\s]+)"/)?.[1] ?? null
    }
    const base = { provider: providerInfo.name, response, responseText, responseTimeMs: elapsedMs(startedAt), contentType: file.mimeType, sizeBytes: file.sizeBytes }
    if (!response?.ok || !isPublicHttpUrl(url)) return failedUpload(base, finalPayload?.error ?? 'Upload completed without a public album URL.')
    const warnings = isPublicHttpUrl(directImageUrl) ? [] : ['Only a public album URL was returned; no direct image URL could be extracted.']
    return successfulUpload(base, { url, directImageUrl, warnings })
  } catch (error) {
    return failedUpload({ provider: providerInfo.name, response, responseText, responseTimeMs: elapsedMs(startedAt), contentType: file.mimeType, sizeBytes: file.sizeBytes }, error.message)
  }
}
