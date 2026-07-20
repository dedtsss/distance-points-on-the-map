import { normalizeBundleResult, normalizeProviderResult, providerRequestPolicy } from './providerPolicy.js';

const viteEnv = import.meta.env || {};
export const DEFAULT_PROXY_URL = viteEnv.VITE_UPLOAD_PROXY_URL || '/api/upload';

export async function requestUploadBundle(entries, proxyUrl, signal, policy) {
  const formData = new FormData();
  formData.append('target', 'bundle');
  formData.append('mode', policy.mode || 'chain');
  formData.append('providerOrder', (policy.providerOrder || []).join(','));
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

const failedResult = (error, policy) => ({
  ...normalizeProviderResult(null, '', { providerOrder: policy.providerOrder }),
  technicalError: error instanceof Error ? error.message : String(error || 'Upload failed'),
});

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
  const results = new Map();
  let completed = 0;

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    options.onProgress?.({
      type: 'started',
      photoId: entry.photoId,
      index,
      photoNumber: index + 1,
      total: entries.length,
      completed,
      providerOrder: policy.providerOrder,
    });

    const controller = new AbortController();
    const abortFromParent = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener?.('abort', abortFromParent, { once: true });
    const timeoutId = globalThis.setTimeout(() => controller.abort(), options.timeoutMsPerPhoto || 180_000);

    let result;
    try {
      const bundle = await request([entry], proxyUrl, controller.signal, policy);
      result = normalizeBundleResult(bundle, [entry]).get(entry.photoId)
        || failedResult('Worker did not return this photo.', policy);
    } catch (error) {
      result = failedResult(error, policy);
    } finally {
      globalThis.clearTimeout(timeoutId);
      options.signal?.removeEventListener?.('abort', abortFromParent);
    }

    results.set(entry.photoId, result);
    completed += 1;
    options.onProgress?.({
      type: 'completed',
      photoId: entry.photoId,
      index,
      photoNumber: index + 1,
      total: entries.length,
      completed,
      result,
      providerOrder: policy.providerOrder,
    });
  }

  return results;
}
