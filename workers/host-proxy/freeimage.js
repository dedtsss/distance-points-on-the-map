import { buildProviderHeaders, toProviderUploadFile } from './privacyHeaders.js';

const API_PAGE_URL = 'https://freeimage.host/api';
const CACHE_TTL_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 45_000;

let cachedConfig = null;

export function parseFreeimageApiPage(html) {
  const key = String(html).match(/<h2>API Key<\/h2>[\s\S]*?<input[^>]+value="([^"]+)"/i)?.[1] || '';
  const endpoint = String(html).match(/<h3>Request URL<\/h3>[\s\S]*?<input[^>]+value="(https:\/\/freeimage\.host\/api\/1\/upload)"/i)?.[1] || '';
  return { key, endpoint };
}

async function getApiConfig(forceRefresh = false) {
  if (!forceRefresh && cachedConfig && cachedConfig.expiresAt > Date.now()) return cachedConfig;

  const response = await fetch(API_PAGE_URL, {
    headers: buildProviderHeaders('freeimage', 'html'),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const html = await response.text();
  const parsed = parseFreeimageApiPage(html);
  if (!response.ok || !parsed.key || !parsed.endpoint) {
    throw new Error(`Freeimage public API configuration is unavailable (HTTP ${response.status}).`);
  }

  cachedConfig = { ...parsed, expiresAt: Date.now() + CACHE_TTL_MS };
  return cachedConfig;
}

const isKeyError = (response, payload, text) => (
  response.status === 401
  || response.status === 403
  || /(?:invalid|wrong|missing).{0,20}(?:api\s*)?key|key.{0,20}(?:invalid|wrong|missing)/i.test(payload?.error?.message || text)
);

async function uploadOnce(file, config) {
  const providerFile = toProviderUploadFile(file);
  const form = new FormData();
  form.append('key', config.key);
  form.append('action', 'upload');
  form.append('format', 'json');
  form.append('source', providerFile, providerFile.name);
  const startedAt = performance.now();
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: buildProviderHeaders('freeimage', 'api'),
    body: form,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  let payload = null;
  try { payload = JSON.parse(text); } catch { /* validated below */ }
  const url = payload?.image?.url_viewer || '';
  const directUrl = payload?.image?.url || payload?.image?.display_url || '';

  return {
    response,
    payload,
    text,
    result: response.ok && payload?.status_code === 200 && url && directUrl
      ? {
        provider: 'freeimage', ok: true, url, directUrl,
        status: response.status,
        responseTimeMs: Math.round(performance.now() - startedAt),
        error: null,
      }
      : null,
  };
}

export async function uploadFreeimage(file) {
  let config = await getApiConfig();
  let attempt = await uploadOnce(file, config);
  if (!attempt.result && isKeyError(attempt.response, attempt.payload, attempt.text)) {
    config = await getApiConfig(true);
    attempt = await uploadOnce(file, config);
  }
  if (!attempt.result) {
    throw new Error(attempt.payload?.error?.message || `Freeimage upload failed (HTTP ${attempt.response.status}).`);
  }
  return attempt.result;
}
