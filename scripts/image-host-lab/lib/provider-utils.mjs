import { readFile } from 'node:fs/promises'

export const USER_AGENT = 'GPS-Checker-Image-Host-Lab/1.0'
export const REQUEST_TIMEOUT_MS = 60_000

export function elapsedMs(startedAt) {
  return Math.round(performance.now() - startedAt)
}

export function isPublicHttpUrl(value) {
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname)
  } catch {
    return false
  }
}

export function looksBlockedOrHtml(text, contentType = '') {
  const sample = text.slice(0, 8_192).toLowerCase()
  const html = contentType.toLowerCase().includes('text/html')
    || /<!doctype html|<html[\s>]|<body[\s>]/i.test(sample)
  const captcha = /captcha|recaptcha|hcaptcha|turnstile/.test(sample)
  const challenge = /cf-chl-|cloudflare|just a moment|attention required/.test(sample)
  return { html, captcha, challenge, blocked: html || captcha || challenge }
}

export async function uploadMultipart({
  provider,
  endpoint,
  filePath,
  fileName,
  mimeType,
  sizeBytes,
  fields = {},
  headers = {},
}) {
  const startedAt = performance.now()
  try {
    const bytes = await readFile(filePath)
    const form = new FormData()
    form.append('file', new Blob([bytes], { type: mimeType }), fileName)
    for (const [name, value] of Object.entries(fields)) form.append(name, String(value))

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/plain, application/json;q=0.9, */*;q=0.1', ...headers },
      body: form,
      redirect: 'follow',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const responseText = await response.text()
    return {
      provider,
      response,
      responseText,
      responseTimeMs: elapsedMs(startedAt),
      contentType: mimeType,
      sizeBytes,
    }
  } catch (error) {
    return {
      provider,
      response: null,
      responseText: '',
      responseTimeMs: elapsedMs(startedAt),
      contentType: mimeType,
      sizeBytes,
      requestError: error,
    }
  }
}

export function failedUpload(base, message, warnings = []) {
  return {
    provider: base.provider,
    ok: false,
    uploadStatus: base.response?.status ?? null,
    url: null,
    directImageUrl: null,
    responseTimeMs: base.responseTimeMs,
    contentType: base.contentType,
    sizeBytes: base.sizeBytes,
    warnings,
    error: message,
    uploadResponseContentType: base.response?.headers.get('content-type') ?? null,
    responseSnippet: base.responseText.slice(0, 500) || null,
  }
}

export function successfulUpload(base, { url, directImageUrl = url, warnings = [], extra = {} }) {
  return {
    provider: base.provider,
    ok: true,
    uploadStatus: base.response.status,
    url,
    directImageUrl,
    responseTimeMs: base.responseTimeMs,
    contentType: base.contentType,
    sizeBytes: base.sizeBytes,
    warnings,
    error: null,
    uploadResponseContentType: base.response.headers.get('content-type'),
    responseSnippet: base.responseText.slice(0, 500) || null,
    ...extra,
  }
}
