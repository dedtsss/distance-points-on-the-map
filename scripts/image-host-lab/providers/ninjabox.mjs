import { readFile } from 'node:fs/promises'
import { REQUEST_TIMEOUT_MS, USER_AGENT } from '../lib/provider-utils.mjs'

export const providerInfo = {
  name: 'Ninjabox.org',
  accountOrKeyRequired: false,
  retention: 'The homepage states that data are stored for up to 180 days, after which they may be deleted.',
  notes: ['No public API is documented; the test uses the public multipart web-upload shape.'],
}

function blocked(text, response) {
  return response.headers.get('cf-mitigated') === 'challenge'
    || /cf-chl-|just a moment|enable javascript and cookies/i.test(text)
}

function urls(text) {
  return [...new Set(text.match(/https?:\/\/[^\s"'<>\\]+/g) ?? [])]
}

export async function uploadBatch(files) {
  const startedAt = performance.now()
  const form = new FormData()
  for (const file of files) {
    const bytes = await readFile(file.filePath)
    form.append('files[]', new Blob([bytes], { type: file.mimeType }), file.fileName)
  }
  form.append('password', '')
  form.append('delete_after_days', '180')
  try {
    const response = await fetch('https://ninjabox.org/', {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html, application/json;q=0.9, */*;q=0.1',
        Referer: 'https://ninjabox.org/',
      },
      body: form,
      redirect: 'follow',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const text = await response.text()
    const foundUrls = urls(text)
    const challenged = blocked(text, response)
    return {
      provider: providerInfo.name,
      ok: response.ok && !challenged && foundUrls.length > 0,
      status: response.status,
      responseTimeMs: Math.round(performance.now() - startedAt),
      contentType: response.headers.get('content-type'),
      finalUrl: response.url,
      challenged,
      cloudflareMitigated: response.headers.get('cf-mitigated') ?? null,
      returnedUrls: challenged ? [] : foundUrls,
      responseSnippet: challenged ? 'Cloudflare challenge response omitted.' : text.slice(0, 800),
      error: challenged
        ? 'Cloudflare Managed Challenge blocked the automated multipart upload.'
        : response.ok ? (foundUrls.length ? null : 'Upload response contained no usable URLs.') : `HTTP ${response.status}`,
    }
  } catch (error) {
    return {
      provider: providerInfo.name, ok: false, status: null,
      responseTimeMs: Math.round(performance.now() - startedAt), contentType: null,
      finalUrl: null, challenged: false, cloudflareMitigated: null, returnedUrls: [],
      responseSnippet: null, error: error.message,
    }
  }
}
