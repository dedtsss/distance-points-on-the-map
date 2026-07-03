const USER_AGENT = 'GPS-Checker-Ninjabox-Cloudflare-Lab/1.0'

const json = (payload, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
})

const elapsed = (startedAt) => Math.round(performance.now() - startedAt)

function isChallenge(response, text) {
  return response.headers.get('cf-mitigated') === 'challenge'
    || /cf-chl-|just a moment|enable javascript and cookies/i.test(text)
}

function decode(value) {
  return String(value ?? '').replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#039;', "'")
}

function formDefinition(html) {
  const forms = [...html.matchAll(/<form\b[\s\S]*?<\/form>/gi)].map((match) => match[0])
  const form = forms.find((candidate) => /type=["']?file/i.test(candidate))
  if (!form) return null
  const action = form.match(/action=["']([^"']*)["']/i)?.[1] ?? '/'
  const fileInput = form.match(/<input[^>]+type=["']?file["']?[^>]*>/i)?.[0] ?? ''
  const fileField = fileInput.match(/name=["']([^"']+)["']/i)?.[1] ?? 'files[]'
  const hidden = [...form.matchAll(/<input[^>]+type=["']?hidden["']?[^>]*>/gi)].map((match) => {
    const name = match[0].match(/name=["']([^"']+)["']/i)?.[1]
    const value = match[0].match(/value=["']([^"']*)["']/i)?.[1] ?? ''
    return name ? { name: decode(name), value: decode(value) } : null
  }).filter(Boolean)
  return { endpoint: new URL(decode(action), 'https://ninjabox.org/').toString(), fileField: decode(fileField), hidden }
}

function extractUrls(text, base) {
  const candidates = [
    ...(text.match(/https?:\/\/[^\s"'<>\\]+/g) ?? []),
    ...[...text.matchAll(/(?:href|src)=["']([^"']+)["']/gi)].map((match) => {
      try { return new URL(decode(match[1]), base).toString() } catch { return null }
    }).filter(Boolean),
  ]
  return [...new Set(candidates)].filter((value) => {
    try {
      const host = new URL(value).hostname
      return host === 'ninjabox.org' || host.endsWith('.ninjabox.org') || host === 'nbox.me' || host.endsWith('.nbox.me')
    } catch { return false }
  })
}

async function checkUrl(url) {
  const result = { url, firstGet: null, secondGet: null, repeatGet: false }
  try {
    for (const field of ['firstGet', 'secondGet']) {
      const startedAt = performance.now()
      const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'image/*, text/html;q=0.8' } })
      const bytes = await response.arrayBuffer()
      result[field] = {
        status: response.status, contentType: response.headers.get('content-type'),
        bytes: bytes.byteLength, responseTimeMs: elapsed(startedAt),
      }
    }
    result.repeatGet = result.firstGet.status === 200 && result.secondGet.status === 200
    return result
  } catch (error) {
    return { ...result, error: error.message }
  }
}

async function analyzeGallery(text, pageUrl) {
  const returnedUrls = extractUrls(text, pageUrl)
  const individualCandidates = returnedUrls.filter((url) => {
    try { return new URL(url).pathname.startsWith('/i/') } catch { return false }
  })
  const imageCandidates = returnedUrls.filter((url) => {
    try { return new URL(url).pathname.startsWith('/storage/') } catch { return false }
  })
  const checks = []
  for (const url of [...individualCandidates, ...imageCandidates]) checks.push(await checkUrl(url))
  const individualPageUrls = checks
    .filter((item) => item.repeatGet && item.firstGet.contentType?.startsWith('text/html') && new URL(item.url).pathname.startsWith('/i/'))
    .map((item) => item.url)
  const imageUrls = checks
    .filter((item) => item.repeatGet && item.firstGet.contentType?.startsWith('image/') && new URL(item.url).pathname.startsWith('/storage/'))
    .map((item) => item.url)
  return { returnedUrls, individualPageUrls, imageUrls, urlChecks: checks }
}

export default {
  async fetch(request) {
    if (request.method !== 'POST') return json({ ok: false, error: 'Use POST multipart/form-data.' }, 405)
    try {
      const incoming = await request.formData()
      const verifyCommonPageUrl = String(incoming.get('verifyCommonPageUrl') ?? '')
      if (verifyCommonPageUrl) {
        const url = new URL(verifyCommonPageUrl)
        if (!['ninjabox.org', 'nbox.me'].includes(url.hostname)) return json({ ok: false, error: 'Invalid Ninjabox gallery URL.' }, 400)
        const startedAt = performance.now()
        const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' } })
        const text = await response.text()
        const challenged = isChallenge(response, text)
        const analysis = challenged ? { returnedUrls: [], individualPageUrls: [], imageUrls: [], urlChecks: [] } : await analyzeGallery(text, response.url)
        const ok = response.ok && !challenged && analysis.individualPageUrls.length === 10 && analysis.imageUrls.length === 10
        return json({
          ok, mode: 'verify-existing-gallery', edge: request.cf?.colo ?? null,
          totalTimeMs: elapsed(startedAt), commonPageUrl: response.url,
          page: { status: response.status, challenged, cfMitigated: response.headers.get('cf-mitigated') },
          ...analysis,
          error: ok ? null : 'The existing gallery did not expose 10 working individual pages and 10 direct images.',
        }, ok ? 200 : 502)
      }
      const files = incoming.getAll('files').filter((item) => item instanceof File)
      if (files.length !== 10) return json({ ok: false, error: `Expected 10 files, received ${files.length}.` }, 400)

      const startedAt = performance.now()
      const pageStarted = performance.now()
      const page = await fetch('https://ninjabox.org/', { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' } })
      const pageText = await page.text()
      const pageResponseTimeMs = elapsed(pageStarted)
      const pageChallenge = isChallenge(page, pageText)
      const definition = pageChallenge ? null : formDefinition(pageText)
      const endpoint = definition?.endpoint ?? 'https://ninjabox.org/'
      const fileField = definition?.fileField ?? 'files[]'

      const form = new FormData()
      for (const hidden of definition?.hidden ?? []) form.append(hidden.name, hidden.value)
      for (const file of files) form.append(fileField, file, file.name)
      form.append('password', '')
      form.append('delete_after_days', '180')
      const uploadStarted = performance.now()
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html, application/json;q=0.9, */*;q=0.1', Referer: 'https://ninjabox.org/' },
        body: form,
        redirect: 'follow',
      })
      const text = await response.text()
      const uploadResponseTimeMs = elapsed(uploadStarted)
      const uploadChallenge = isChallenge(response, text)
      const analysis = uploadChallenge ? { returnedUrls: [], individualPageUrls: [], imageUrls: [], urlChecks: [] } : await analyzeGallery(text, response.url)
      const commonPageUrl = response.url !== endpoint && response.url.startsWith('https://') ? response.url : null
      const ok = response.ok && !uploadChallenge && Boolean(commonPageUrl)
        && analysis.individualPageUrls.length === 10 && analysis.imageUrls.length === 10
      return json({
        ok,
        edge: request.cf?.colo ?? null,
        totalTimeMs: elapsed(startedAt),
        page: { status: page.status, responseTimeMs: pageResponseTimeMs, challenged: pageChallenge, cfMitigated: page.headers.get('cf-mitigated') },
        upload: { status: response.status, responseTimeMs: uploadResponseTimeMs, endpoint, fileField, challenged: uploadChallenge, cfMitigated: response.headers.get('cf-mitigated'), finalUrl: response.url },
        commonPageUrl,
        ...analysis,
        responseSnippet: uploadChallenge ? 'Cloudflare challenge response omitted.' : text.slice(0, 1200),
        error: ok ? null : uploadChallenge ? 'Cloudflare Managed Challenge blocked the batch upload.' : 'No common page with 10 verified image URLs was returned.',
      }, ok ? 200 : 502)
    } catch (error) {
      return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 502)
    }
  },
}
