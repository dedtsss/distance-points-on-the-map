import { normalizeBundleResult } from './providerPolicy.js';
import { providerRequestPolicy } from './providerPolicy.js';

const viteEnv = import.meta.env || {};
export const DEFAULT_PROXY_URL = viteEnv.VITE_UPLOAD_PROXY_URL || '/api/upload';

export async function requestUploadBundle(entries, proxyUrl, signal, policy) {
  const formData = new FormData();
  formData.append('target', 'bundle');
  formData.append('providers', policy.providers);
  formData.append('includeX0', String(policy.includeX0));
  formData.append('fallback', policy.fallback);
  entries.forEach((entry) => {
    formData.append('photoId', entry.photoId);
    formData.append('files', entry.file, entry.file.name);
  });

  const response = await fetch(proxyUrl, { method: 'POST', body: formData, signal });
  const responseText = await response.text();
  let data = null;
  try { data = JSON.parse(responseText); } catch { /* handled below */ }

  if (!response.ok || data?.target !== 'bundle' || !Array.isArray(data?.items)) {
    throw new Error(data?.error || `Worker вернул HTTP ${response.status}`);
  }
  return data;
}

export async function uploadCleanedPhotos(entries, options = {}) {
  if (!Array.isArray(entries) || entries.length === 0) return new Map();
  const proxyUrl = String(options.proxyUrl || DEFAULT_PROXY_URL).trim();
  if (!proxyUrl) throw new Error('Worker URL не настроен');
  const policy = providerRequestPolicy(options.providerSettings);
  if (!policy.valid) throw new Error(policy.error);

  entries.forEach((entry) => {
    if (!entry.cleaned || !entry.file || entry.file === entry.originalFile) {
      throw new Error('Upload принимает только очищенные копии');
    }
  });

  const request = options.dependencies?.requestBundle || requestUploadBundle;
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), options.timeoutMs || 180_000);

  try {
    const bundle = await request(entries, proxyUrl, options.signal || controller.signal, policy);
    return normalizeBundleResult(bundle, entries);
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}
