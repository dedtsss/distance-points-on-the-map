import { buildProviderHeaders, toProviderUploadFile } from './privacyHeaders.js';

const UPLOAD_URL = 'https://x0.at/';
const REQUEST_TIMEOUT_MS = 45_000;

const isPublicUrl = (value) => {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && Boolean(url.hostname);
  } catch {
    return false;
  }
};

export async function uploadX0(file) {
  const providerFile = toProviderUploadFile(file);
  const form = new FormData();
  form.append('file', providerFile, providerFile.name);
  form.append('id_length', '12');
  const startedAt = performance.now();
  const response = await fetch(UPLOAD_URL, {
    method: 'POST',
    headers: buildProviderHeaders('x0', 'api'),
    body: form,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  const url = text.trim().split(/\s+/)[0] || '';
  if (!response.ok || !isPublicUrl(url) || /<!doctype|<html|<body/i.test(text)) {
    throw new Error(`x0.at upload failed (HTTP ${response.status}).`);
  }
  return {
    provider: 'x0',
    ok: true,
    url,
    directUrl: url,
    status: response.status,
    responseTimeMs: Math.round(performance.now() - startedAt),
    error: null,
  };
}
