import { uploadFreeimage } from './freeimage.js';
import { uploadNinjabox } from './ninjabox.js';
import { uploadX0 } from './x0.js';

const MAX_FILES = 20;
const FILE_CONCURRENCY = 2;
const DEFAULT_PROVIDER_ORDER = Object.freeze(['ninjabox', 'freeimage', 'x0']);
const ALLOWED_PROVIDERS = new Set(DEFAULT_PROVIDER_ORDER);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-App-Access-Token',
};
const API_UPLOAD_PATH = '/api/upload';
const AUTH_REALM = 'GPS Checker';

const json = (payload, status = 200) => new Response(JSON.stringify(payload, null, 2), {
  status,
  headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
});

const errorMessage = (error) => (error instanceof Error ? error.message : String(error || 'Unknown upload error'));
const textEncoder = new TextEncoder();

const safeEqual = (left, right) => {
  const leftBytes = textEncoder.encode(String(left || ''));
  const rightBytes = textEncoder.encode(String(right || ''));
  let diff = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    diff |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  }
  return diff === 0;
};

const getBasicAuthPassword = (env = {}) => String(env.BASIC_AUTH_PASSWORD || '').trim();
const getBearerToken = (env = {}) => String(env.APP_ACCESS_TOKEN || '').trim();
const getBasicAuthUsername = (env = {}, required = false) => {
  const username = String(env.BASIC_AUTH_USERNAME || '').trim();
  return username || (required ? '' : 'owner');
};
const isBasicAuthRequired = (env = {}) => String(env.BASIC_AUTH_REQUIRED || '').trim().toLowerCase() === 'true';

const decodeBasicCredentials = (authorization) => {
  const match = String(authorization || '').match(/^Basic\s+(.+)$/i);
  if (!match) return null;
  try {
    const decoded = atob(match[1]);
    const separator = decoded.indexOf(':');
    if (separator < 0) return null;
    return { username: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
  } catch {
    return null;
  }
};

export function isAuthorizedRequest(request, env = {}) {
  const basicPassword = getBasicAuthPassword(env);
  const bearerToken = getBearerToken(env);
  const basicRequired = isBasicAuthRequired(env);
  const basicUsername = getBasicAuthUsername(env, basicRequired);

  if (basicRequired && (!basicUsername || !basicPassword)) return false;

  const authorization = request.headers.get('Authorization') || '';
  const basic = decodeBasicCredentials(authorization);
  if (basicUsername && basicPassword && basic && safeEqual(basic.username, basicUsername) && safeEqual(basic.password, basicPassword)) {
    return true;
  }
  if (basicRequired) return false;

  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || '';
  const headerToken = request.headers.get('X-App-Access-Token') || '';
  if (bearerToken && (safeEqual(bearer, bearerToken) || safeEqual(headerToken, bearerToken))) return true;
  return !basicPassword && !bearerToken;
}

const unauthorized = () => new Response('Authentication required', {
  status: 401,
  headers: {
    'Cache-Control': 'no-store',
    'WWW-Authenticate': `Basic realm="${AUTH_REALM}", charset="UTF-8"`,
  },
});

const isUploadPath = (request) => {
  const url = new URL(request.url);
  return url.pathname === API_UPLOAD_PATH
    || url.pathname === `${API_UPLOAD_PATH}/`
    || (url.pathname === '/' && request.method === 'POST');
};

const wantsHtml = (request) => {
  const accept = request.headers.get('Accept') || '';
  return request.method === 'GET' && (accept.includes('text/html') || accept === '');
};

const failedProvider = (provider, error) => ({
  provider,
  ok: false,
  url: null,
  directUrl: null,
  error: errorMessage(error),
});

async function mapWithConcurrency(items, limit, callback) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await callback(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const normalizeOrder = (order) => [...new Set((order || [])
  .map((provider) => String(provider || '').trim().toLowerCase())
  .filter((provider) => ALLOWED_PROVIDERS.has(provider)))];

export function normalizeWorkerPolicy(policy = {}) {
  let providerOrder = normalizeOrder(policy.providerOrder);
  if (providerOrder.length === 0 && Array.isArray(policy.selectedProviders)) {
    providerOrder = normalizeOrder([
      ...(policy.selectedProviders.includes('ninjabox') ? ['ninjabox'] : []),
      ...(policy.selectedProviders.includes('freeimage') ? ['freeimage'] : []),
      ...(policy.includeX0 === true || policy.fallback === 'x0' ? ['x0'] : []),
    ]);
  }
  if (providerOrder.length === 0) providerOrder = [...DEFAULT_PROVIDER_ORDER];
  return {
    mode: 'chain',
    providerOrder,
    selectedProviders: providerOrder.filter((provider) => provider !== 'x0'),
    includeX0: false,
    fallback: 'chain',
  };
}

export function parseWorkerPolicy(formData) {
  const rawOrder = formData.get('providerOrder');
  const rawProviders = formData.get('providers');
  if (rawOrder !== null) {
    return normalizeWorkerPolicy({
      providerOrder: String(rawOrder).split(',').map((item) => item.trim()).filter(Boolean),
    });
  }
  if (rawProviders !== null) {
    const selectedProviders = String(rawProviders).split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
    return normalizeWorkerPolicy({
      selectedProviders,
      includeX0: String(formData.get('includeX0') || 'false').toLowerCase() === 'true',
      fallback: formData.get('fallback') === null ? 'x0' : String(formData.get('fallback')).toLowerCase(),
    });
  }
  return normalizeWorkerPolicy();
}

const normalizeNinjaboxItem = async (file, upload) => {
  const batch = await upload([file]);
  const item = batch?.items?.[0];
  if (!batch?.ok || !item?.url) {
    throw new Error(batch?.error || 'NinjaBox returned no link for the photo.');
  }
  return {
    provider: 'ninjabox',
    ok: true,
    url: item.url,
    directUrl: item.directUrl || null,
    galleryUrl: batch.galleryUrl || null,
    status: batch.status || 200,
    responseTimeMs: batch.responseTimeMs || null,
    error: null,
  };
};

async function runProvider(provider, file, providerOverrides = {}) {
  try {
    if (provider === 'ninjabox') {
      return await normalizeNinjaboxItem(file, providerOverrides.ninjabox || uploadNinjabox);
    }
    if (provider === 'freeimage') {
      return await (providerOverrides.freeimage || uploadFreeimage)(file);
    }
    if (provider === 'x0') {
      return await (providerOverrides.x0 || uploadX0)(file);
    }
    return failedProvider(provider, 'Unsupported provider.');
  } catch (error) {
    return failedProvider(provider, error);
  }
}

export function composeBundleItem({
  index,
  photoId,
  fileName,
  attempts = [],
  providerOrder = DEFAULT_PROVIDER_ORDER,
}) {
  const selected = attempts.find((attempt) => attempt?.ok && attempt?.url) || null;
  const attemptedProviders = attempts.map((attempt) => attempt.provider);
  const replaced = attempts.filter((attempt) => !attempt?.ok).map((attempt) => attempt.provider);
  const links = selected ? [{
    provider: selected.provider,
    role: selected.provider === providerOrder[0] ? 'primary' : 'fallback',
    url: selected.url,
    directUrl: selected.directUrl || null,
    replaces: selected.provider === providerOrder[0] ? [] : replaced,
  }] : [];
  const providers = Object.fromEntries(DEFAULT_PROVIDER_ORDER.map((provider) => [
    provider,
    attempts.find((attempt) => attempt.provider === provider) || null,
  ]));

  return {
    index,
    photoId,
    fileName,
    ok: links.length === 1,
    partial: false,
    links,
    providers,
    attempts,
    attemptedProviders,
    providerOrder,
    selectedProvider: selected?.provider || null,
    galleryUrl: selected?.provider === 'ninjabox' ? selected.galleryUrl || null : null,
  };
}

async function uploadOneWithChain(file, index, photoId, providerOverrides, policy) {
  const attempts = [];
  for (const provider of policy.providerOrder) {
    const result = await runProvider(provider, file, providerOverrides);
    attempts.push(result);
    if (result.ok && result.url) break;
  }
  return composeBundleItem({
    index,
    photoId,
    fileName: file.name,
    attempts,
    providerOrder: policy.providerOrder,
  });
}

export async function uploadBundle(files, photoIds, providerOverrides = {}, requestedPolicy = {}) {
  const policy = normalizeWorkerPolicy(requestedPolicy);
  const items = await mapWithConcurrency(files, FILE_CONCURRENCY, (file, index) => (
    uploadOneWithChain(file, index, photoIds[index] || String(index), providerOverrides, policy)
  ));
  return {
    ok: items.every((item) => item.ok),
    target: 'bundle',
    mode: 'chain',
    providerOrder: policy.providerOrder,
    selectedProviders: policy.selectedProviders,
    includeX0: false,
    fallback: 'chain',
    ninjaboxGalleryUrl: items.find((item) => item.selectedProvider === 'ninjabox')?.galleryUrl || null,
    completeCount: items.filter((item) => item.ok).length,
    partialCount: 0,
    failedCount: items.filter((item) => !item.ok).length,
    items,
  };
}

const getFiles = (formData) => {
  const batchFiles = formData.getAll('files').filter((item) => item instanceof File);
  const singleFile = formData.get('file');
  if (batchFiles.length > 0) return batchFiles;
  return singleFile instanceof File ? [singleFile] : [];
};

export async function handleUploadRequest(request, providerOverrides = {}) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (request.method !== 'POST') return json({ ok: false, error: 'Use POST multipart/form-data.' }, 405);

  try {
    const formData = await request.formData();
    const target = String(formData.get('target') || 'bundle').toLowerCase();
    const files = getFiles(formData);
    if (files.length === 0) return json({ ok: false, error: 'No upload files found.' }, 400);
    if (files.length > MAX_FILES) return json({ ok: false, error: `Maximum ${MAX_FILES} files per request.` }, 400);

    if (target === 'bundle') {
      const policy = parseWorkerPolicy(formData);
      return json(await uploadBundle(files, formData.getAll('photoId').map(String), providerOverrides, policy));
    }
    if (target === 'freeimage') return json(await (providerOverrides.freeimage || uploadFreeimage)(files[0]));
    if (target === 'ninjabox') return json(await (providerOverrides.ninjabox || uploadNinjabox)(files));
    if (target === 'x0') return json(await (providerOverrides.x0 || uploadX0)(files[0]));
    return json({ ok: false, error: 'Unknown target. Use bundle, freeimage, ninjabox, or x0.' }, 400);
  } catch (error) {
    return json({ ok: false, error: errorMessage(error) }, 502);
  }
}

async function serveStaticAsset(request, env = {}) {
  if (!env.ASSETS) return json({ ok: false, error: 'Static assets binding is not configured.' }, 404);
  const response = await env.ASSETS.fetch(request);
  if (response.status !== 404 || !wantsHtml(request)) return response;
  const url = new URL(request.url);
  url.pathname = '/index.html';
  url.search = '';
  return env.ASSETS.fetch(new Request(url, request));
}

export async function handleWorkerRequest(request, env = {}, providerOverrides = {}) {
  if (!isAuthorizedRequest(request, env)) return unauthorized();
  const url = new URL(request.url);
  if (isUploadPath(request)) return handleUploadRequest(request, providerOverrides);
  if (url.pathname.startsWith('/api/')) return json({ ok: false, error: 'Unknown API route.' }, 404);
  return serveStaticAsset(request, env);
}

export default {
  async fetch(request, env) {
    return handleWorkerRequest(request, env);
  },
};
