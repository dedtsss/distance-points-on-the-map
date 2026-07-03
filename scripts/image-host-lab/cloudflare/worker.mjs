const USER_AGENT = 'GPS-Checker-Image-Host-Cloudflare-Lab/1.0'

const json = (payload, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
})

const elapsed = (startedAt) => Math.round(performance.now() - startedAt)

function publicUrl(value) {
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:') && Boolean(url.hostname)
  } catch {
    return false
  }
}

async function sha256(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('')
}

async function verifyDirectUrl(url, expectedBytes, expectedHash) {
  const result = { head: null, firstGet: null, secondGet: null, repeatGet: false, directImage: false, exactSize: false, exactContent: false }
  const headStarted = performance.now()
  const head = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': USER_AGENT, Accept: 'image/*' } })
  result.head = {
    status: head.status,
    contentType: head.headers.get('content-type'),
    contentLength: Number(head.headers.get('content-length')) || null,
    responseTimeMs: elapsed(headStarted),
  }
  for (const field of ['firstGet', 'secondGet']) {
    const startedAt = performance.now()
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'image/*' } })
    const bytes = await response.arrayBuffer()
    result[field] = {
      status: response.status,
      contentType: response.headers.get('content-type'),
      contentLength: Number(response.headers.get('content-length')) || null,
      receivedBytes: bytes.byteLength,
      sha256: await sha256(bytes),
      responseTimeMs: elapsed(startedAt),
    }
  }
  result.repeatGet = result.firstGet.status === 200 && result.secondGet.status === 200
  result.directImage = result.repeatGet
    && result.firstGet.contentType?.startsWith('image/') === true
    && result.secondGet.contentType?.startsWith('image/') === true
  result.exactSize = result.firstGet.receivedBytes === expectedBytes && result.secondGet.receivedBytes === expectedBytes
  result.exactContent = result.firstGet.sha256 === expectedHash && result.secondGet.sha256 === expectedHash
  return result
}

async function uploadFreeimage(file, knownKey) {
  const pageStarted = performance.now()
  const page = await fetch('https://freeimage.host/api', {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
    cf: { cacheTtl: 0 },
  })
  const html = await page.text()
  const pageFetchTimeMs = elapsed(pageStarted)
  const currentKey = html.match(/<h2>API Key<\/h2>[\s\S]*?<input[^>]+value="([^"]+)"/i)?.[1]
  const endpoint = html.match(/<h3>Request URL<\/h3>[\s\S]*?<input[^>]+value="(https:\/\/freeimage\.host\/api\/1\/upload)"/i)?.[1]
  if (!page.ok || !currentKey || !endpoint) throw new Error(`Freeimage API configuration fetch failed (HTTP ${page.status})`)

  const bytes = await file.arrayBuffer()
  const inputHash = await sha256(bytes)
  const form = new FormData()
  form.append('key', knownKey === currentKey ? knownKey : currentKey)
  form.append('action', 'upload')
  form.append('format', 'json')
  form.append('source', new File([bytes], file.name, { type: file.type }), file.name)
  const uploadStarted = performance.now()
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    body: form,
  })
  const text = await response.text()
  let payload = null
  try { payload = JSON.parse(text) } catch { /* validated below */ }
  const url = payload?.image?.url_viewer ?? null
  const directImageUrl = payload?.image?.url ?? payload?.image?.display_url ?? null
  if (!response.ok || payload?.status_code !== 200 || !publicUrl(url) || !publicUrl(directImageUrl)) {
    throw new Error(payload?.error?.message ?? `Freeimage API upload failed (HTTP ${response.status})`)
  }
  return {
    provider: 'Freeimage.host',
    keyCheck: {
      pageStatus: page.status,
      pageFetchTimeMs,
      matchedConfiguredKey: knownKey === currentKey,
      refreshedFromPage: knownKey !== currentKey,
    },
    uploadStatus: response.status,
    uploadTimeMs: elapsed(uploadStarted),
    url,
    directImageUrl,
    verification: await verifyDirectUrl(directImageUrl, bytes.byteLength, inputHash),
  }
}

async function uploadX0(file) {
  const bytes = await file.arrayBuffer()
  const inputHash = await sha256(bytes)
  const form = new FormData()
  form.append('file', new File([bytes], file.name, { type: file.type }), file.name)
  form.append('id_length', '12')
  const uploadStarted = performance.now()
  const response = await fetch('https://x0.at/', {
    method: 'POST',
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/plain, */*;q=0.1' },
    body: form,
  })
  const text = await response.text()
  const url = text.trim().split(/\s+/)[0]
  if (!response.ok || !publicUrl(url) || /<!doctype|<html|<body/i.test(text)) {
    throw new Error(`x0.at upload failed (HTTP ${response.status}): ${text.slice(0, 160)}`)
  }
  return {
    provider: 'x0.at',
    uploadStatus: response.status,
    uploadTimeMs: elapsed(uploadStarted),
    url,
    directImageUrl: url,
    verification: await verifyDirectUrl(url, bytes.byteLength, inputHash),
  }
}

export default {
  async fetch(request) {
    if (request.method !== 'POST') return json({ ok: false, error: 'Use POST multipart/form-data.' }, 405)
    try {
      const form = await request.formData()
      const target = String(form.get('target') ?? '').toLowerCase()
      const file = form.get('file')
      if (!(file instanceof File)) return json({ ok: false, error: 'Missing file.' }, 400)
      const startedAt = performance.now()
      const result = target === 'freeimage'
        ? await uploadFreeimage(file, String(form.get('knownFreeimageKey') ?? ''))
        : target === 'x0'
          ? await uploadX0(file)
          : null
      if (!result) return json({ ok: false, error: 'Unknown target.' }, 400)
      const ok = result.verification.repeatGet && result.verification.directImage
        && result.verification.exactSize && result.verification.exactContent
      return json({ ok, edge: request.cf?.colo ?? null, totalTimeMs: elapsed(startedAt), ...result }, ok ? 200 : 502)
    } catch (error) {
      return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 502)
    }
  },
}
