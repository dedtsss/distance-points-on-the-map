import { uploadFreeimage } from './freeimage.js';
import { uploadNinjabox } from './ninjabox.js';
import { uploadX0 } from './x0.js';

const MAX_FILES = 20;
const PROVIDER_CONCURRENCY = 2;
const DEFAULT_SELECTED_PROVIDERS = ['freeimage', 'ninjabox'];

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
const getAccessUsername = (env = {}) => String(env.BASIC_AUTH_USERNAME || 'owner');
const isBasicAuthRequired = (env = {}) => String(env.BASIC_AUTH_REQUIRED || '').trim().toLowerCase() === 'true';

const decodeBasicCredentials = (authorization) => {
  const match = String(authorization || '').match(/^Basic\s+(.+)$/i);
  if (!match) return null;
  try {
    const decoded = atob(match[1]);
    const separator = decoded.indexOf(':');
    if (separator < 0) return null;
    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
};

export function isAuthorizedRequest(request, env = {}) {
  const basicPassword = getBasicAuthPassword(env);
  const bearerToken = getBearerToken(env);
  const basicRequired = isBasicAuthRequired(env);

  const authorization = request.headers.get('Authorization') || '';
  const basic = decodeBasicCredentials(authorization);
  if (basicPassword && basic && safeEqual(basic.username, getAccessUsername(env)) && safeEqual(basic.password, basicPassword)) {
    return true;
  }

  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || '';
  const headerToken = request.headers.get('X-App-Access-Token') || '';
  if (bearerToken && (safeEqual(bearer, bearerToken) || safeEqual(headerToken, bearerToken))) {
    return true;
  }

  if (basicRequired) return false;
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

const uploadIndividually = (files, provider, upload) => mapWithConcurrency(
  files,
  PROVIDER_CONCURRENCY,
  async (file) => {
    try { return await upload(file); } catch (error) { return failedProvider(provider, error); }
  },
);

export function normalizeWorkerPolicy(policy = {}) {
  const selectedProviders = Array.isArray(policy.selectedProviders)
    ? [...new Set(policy.selectedProviders.filter((provider) => DEFAULT_SELECTED_PROVIDERS.includes(provider)))]
    : DEFAULT_SELECTED_PROVIDERS;
  if (selectedProviders.length === 0) throw new Error('Select at least one primary provider.');
  return {
    selectedProviders,
    includeX0: policy.includeX0 === true,
    fallback: policy.fallback === 'none' ? 'none' : 'x0',
  };
}

export function parseWorkerPolicy(formData) {
  const rawProviders = formData.get('providers');
  const selectedProviders = rawProviders === null
    ? DEFAULT_SELECTED_PROVIDERS
    : String(rawProviders).split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  return normalizeWorkerPolicy({
    selectedProviders,
    includeX0: String(formData.get('includeX0') || 'false').toLowerCase() === 'true',
    fallback: formData.get('fallback') === null ? 'x0' : String(formData.get('fallback')).toLowerCase(),
  });
}

export function composeBundleItem({
  index,
  photoId,
  fileName,
  freeimage = null,
  ninjabox = null,
  fallback = null,
  selectedProviders = DEFAULT_SELECTED_PROVIDERS,
  includeX0 = false,
  fallbackPolicy = 'x0',
}) {
  const links = [];
  if (freeimage?.ok) links.push({ provider: 'freeimage', role: 'primary', url: freeimage.url, directUrl: freeimage.directUrl });
  if (ninjabox?.ok) links.push({ provider: 'ninjabox', role: 'secondary', url: ninjabox.url, directUrl: ninjabox.directUrl });
  const replaces = selectedProviders.filter((provider) => (
    provider === 'freeimage' ? !freeimage?.ok : !ninjabox?.ok
  ));
  if (fallback?.ok) {
    links.push({
      provider: 'x0',
      role: includeX0 ? 'required' : 'fallback',
      url: fallback.url,
      directUrl: fallback.directUrl,
      replaces,
    });
  }
  const expectedLinkCount = selectedProviders.length + (includeX0 ? 1 : 0);
  return {
    index,
    photoId,
    fileName,
    ok: links.length >= expectedLinkCount,
    partial: links.length > 0 && links.length < expectedLinkCount,
    links,
    providers: {
      freeimage: selectedProviders.includes('freeimage') ? freeimage : null,
      ninjabox: selectedProviders.includes('ninjabox') ? ninjabox : null,
      x0: fallback,
    },
    selectedProviders,
    includeX0,
    fallback: fallbackPolicy,
  };
}

export async function uploadBundle(files, photoIds, providerOverrides = {}, requestedPolicy = {}) {
  const policy = normalizeWorkerPolicy(requestedPolicy);
  const freeimageUpload = providerOverrides.freeimage || uploadFreeimage;
  const ninjaboxUpload = providerOverrides.ninjabox || uploadNinjabox;
  const x0Upload = providerOverrides.x0 || uploadX0;

  const freeimagePromise = policy.selectedProviders.includes('freeimage')
    ? uploadIndividually(files, 'freeimage', freeimageUpload)
    : Promise.resolve(files.map(() => null));
  const ninjaPromise = policy.selectedProviders.includes('ninjabox')
    ? ninjaboxUpload(files).catch((error) => ({ ok: false, galleryUrl: null, items: [], error: errorMessage(error) }))
    : Promise.resolve({ ok: false, galleryUrl: null, items: [], error: null });
  const [ninjabox, freeimage] = await Promise.all([ninjaPromise, freeimagePromise]);

  const primaryResults = files.map((file, index) => ({
    file,
    index,
    photoId: photoIds[index] || String(index),
    freeimage: policy.selectedProviders.includes('freeimage') ? freeimage[index] : null,
    ninjabox: policy.selectedProviders.includes('ninjabox')
      ? (ninjabox.ok && ninjabox.items[index]
        ? { provider: 'ninjabox', ok: true, ...ninjabox.items[index], error: null }
        : failedProvider('ninjabox', ninjabox.error || `Ninjabox returned no link for file ${index + 1}`))
      : null,
  }));

  const needsFallback = (item) => policy.selectedProviders.some((provider) => (
    provider === 'freeimage' ? !item.freeimage?.ok : !item.ninjabox?.ok
  ));
  const x0Indexes = primaryResults
    .filter((item) => policy.includeX0 || (policy.fallback === 'x0' && needsFallback(item)))
    .map((item) => item.index);
  const x0Uploads = await uploadIndividually(x0Indexes.map((index) => files[index]), 'x0', x0Upload);
  const x0ByIndex = new Map(x0Indexes.map((index, offset) => [index, x0Uploads[offset]]));

  const items = primaryResults.map((item) => composeBundleItem({
    index: item.index,
    photoId: item.photoId,
    fileName: item.file.name,
    freeimage: item.freeimage,
    ninjabox: item.ninjabox,
    fallback: x0ByIndex.get(item.index) || null,
    selectedProviders: policy.selectedProviders,
    includeX0: policy.includeX0,
    fallbackPolicy: policy.fallback,
  }));

  return {
    ok: items.every((item) => item.ok),
    target: 'bundle',
    providerOrder: [...policy.selectedProviders, ...(policy.includeX0 || policy.fallback === 'x0' ? ['x0'] : [])],
    selectedProviders: policy.selectedProviders,
    includeX0: policy.includeX0,
    fallback: policy.fallback,
    ninjaboxGalleryUrl: policy.selectedProviders.includes('ninjabox') ? ninjabox.galleryUrl || null : null,
    completeCount: items.filter((item) => item.ok).length,
    partialCount: items.filter((item) => item.partial).length,
    failedCount: items.filter((item) => item.links.length === 0).length,
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
      let policy;
      try { policy = parseWorkerPolicy(formData); } catch (error) { return json({ ok: false, error: errorMessage(error) }, 400); }
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
