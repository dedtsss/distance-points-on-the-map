import { buildProviderHeaders, toProviderUploadFile } from './privacyHeaders.js';

const PAGE_URL = 'https://ninjabox.org/';
const REQUEST_TIMEOUT_MS = 60_000;

const decodeHtml = (value) => String(value || '')
  .replaceAll('&amp;', '&')
  .replaceAll('&quot;', '"')
  .replaceAll('&#039;', "'")
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>');

export function parseNinjaboxForm(html) {
  const forms = [...String(html).matchAll(/<form\b[\s\S]*?<\/form>/gi)].map((match) => match[0]);
  const form = forms.find((candidate) => /type=["']?file/i.test(candidate));
  if (!form) return null;

  const action = form.match(/action=["']([^"']*)["']/i)?.[1] || '/';
  const fileInput = form.match(/<input[^>]+type=["']?file["']?[^>]*>/i)?.[0] || '';
  const fileField = fileInput.match(/name=["']([^"']+)["']/i)?.[1] || 'files';
  const hiddenInputs = [...form.matchAll(/<input[^>]+type=["']?hidden["']?[^>]*>/gi)].map((match) => {
    const name = match[0].match(/name=["']([^"']+)["']/i)?.[1];
    const value = match[0].match(/value=["']([^"']*)["']/i)?.[1] || '';
    return name ? { name: decodeHtml(name), value: decodeHtml(value) } : null;
  }).filter(Boolean);

  return {
    endpoint: new URL(decodeHtml(action), PAGE_URL).toString(),
    fileField: decodeHtml(fileField),
    hiddenInputs,
  };
}

const absoluteUrl = (value, baseUrl) => {
  try { return new URL(decodeHtml(value), baseUrl).toString(); } catch { return ''; }
};

export function parseNinjaboxGallery(html, baseUrl = PAGE_URL) {
  const attributes = [...String(html).matchAll(/(?:href|src)=["']([^"']+)["']/gi)]
    .map((match) => absoluteUrl(match[1], baseUrl))
    .filter(Boolean);
  const viewerUrls = [...new Set(attributes.filter((url) => {
    try { return new URL(url).hostname === 'ninjabox.org' && new URL(url).pathname.startsWith('/i/'); } catch { return false; }
  }))];
  const directUrls = [...new Set(attributes.filter((url) => {
    try { return new URL(url).hostname === 'ninjabox.org' && new URL(url).pathname.startsWith('/storage/'); } catch { return false; }
  }))];
  return viewerUrls.map((url, index) => ({ url, directUrl: directUrls[index] || null }));
}

const isChallenge = (response, text) => (
  response.headers.get('cf-mitigated') === 'challenge'
  || /cf-chl-|just a moment|enable javascript and cookies/i.test(text)
);

export async function uploadNinjabox(files) {
  const page = await fetch(PAGE_URL, {
    headers: buildProviderHeaders('ninjabox', 'html'),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const html = await page.text();
  if (!page.ok || isChallenge(page, html)) {
    throw new Error(`Ninjabox upload form is unavailable (HTTP ${page.status}).`);
  }
  const definition = parseNinjaboxForm(html);
  if (!definition) throw new Error('Ninjabox upload form was not found.');

  const form = new FormData();
  for (const hidden of definition.hiddenInputs) form.append(hidden.name, hidden.value);
  for (const file of files) {
    const providerFile = toProviderUploadFile(file);
    form.append(definition.fileField, providerFile, providerFile.name);
  }
  if (!form.has('password')) form.append('password', '');
  if (!form.has('delete_after_days')) form.append('delete_after_days', '180');

  const startedAt = performance.now();
  const response = await fetch(definition.endpoint, {
    method: 'POST',
    headers: buildProviderHeaders('ninjabox', 'html_upload'),
    body: form,
    redirect: 'follow',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const resultHtml = await response.text();
  if (!response.ok || isChallenge(response, resultHtml)) {
    throw new Error(`Ninjabox batch upload failed (HTTP ${response.status}).`);
  }
  const items = parseNinjaboxGallery(resultHtml, response.url);
  if (items.length !== files.length || items.some((item) => !item.directUrl)) {
    throw new Error(`Ninjabox returned ${items.length} photo links for ${files.length} files.`);
  }

  return {
    provider: 'ninjabox',
    ok: true,
    galleryUrl: response.url,
    items,
    status: response.status,
    responseTimeMs: Math.round(performance.now() - startedAt),
    error: null,
  };
}
