import assert from 'node:assert/strict';

import { parseFreeimageApiPage, uploadFreeimage } from '../workers/host-proxy/freeimage.js';
import { parseNinjaboxForm, parseNinjaboxGallery, uploadNinjabox } from '../workers/host-proxy/ninjabox.js';
import {
  assertProviderHeadersPrivate,
  buildProviderHeaders,
  formDataPrivacyFields,
} from '../workers/host-proxy/privacyHeaders.js';
import {
  composeBundleItem,
  handleWorkerRequest,
  isAuthorizedRequest,
  normalizeWorkerPolicy,
  uploadBundle,
} from '../workers/host-proxy/worker.js';
import { uploadX0 } from '../workers/host-proxy/x0.js';
import { requestUploadBundle, uploadCleanedPhotos } from '../src/features/upload/uploadService.js';
import {
  DEFAULT_PROVIDER_SETTINGS,
  providerRequestPolicy,
  validateProviderSettings,
} from '../src/features/upload/providerPolicy.js';

const freeimageConfig = parseFreeimageApiPage(`
  <h2>API Key</h2><div><input value="public-test-key"></div>
  <h3>Request URL</h3><div><input value="https://freeimage.host/api/1/upload"></div>
`);
assert.deepEqual(freeimageConfig, { key: 'public-test-key', endpoint: 'https://freeimage.host/api/1/upload' });

const form = parseNinjaboxForm(`
  <form action="/put" method="post">
    <input type="hidden" name="csrf" value="test-token">
    <input name="files" type="file" multiple>
  </form>
`);
assert.equal(form.endpoint, 'https://ninjabox.org/put');
assert.equal(form.fileField, 'files');
assert.deepEqual(form.hiddenInputs, [{ name: 'csrf', value: 'test-token' }]);

const gallery = parseNinjaboxGallery(`
  <a href="/i/photo-1"><img src="/storage/gallery/one.png"></a>
  <a href="/i/photo-2"><img src="/storage/gallery/two.png"></a>
`, 'https://ninjabox.org/gallery');
assert.deepEqual(gallery, [
  { url: 'https://ninjabox.org/i/photo-1', directUrl: 'https://ninjabox.org/storage/gallery/one.png' },
  { url: 'https://ninjabox.org/i/photo-2', directUrl: 'https://ninjabox.org/storage/gallery/two.png' },
]);

for (const headers of [
  buildProviderHeaders('freeimage', 'html'),
  buildProviderHeaders('freeimage', 'api'),
  buildProviderHeaders('ninjabox', 'html'),
  buildProviderHeaders('ninjabox', 'html_upload'),
  buildProviderHeaders('x0', 'api'),
]) {
  assert.equal(assertProviderHeadersPrivate(headers), true);
  assert.equal(Object.keys(headers).some((name) => /^(authorization|cookie|cf-access-client-id|cf-access-client-secret)$/i.test(name)), false);
}
assert.equal(buildProviderHeaders('ninjabox', 'html_upload').Referer, 'https://ninjabox.org/');

assert.deepEqual(DEFAULT_PROVIDER_SETTINGS, {
  ninjabox: true,
  fallbackFreeimage: true,
  fallbackX0: true,
});
assert.equal(validateProviderSettings(DEFAULT_PROVIDER_SETTINGS).valid, true);
assert.equal(validateProviderSettings({ ninjabox: false }).valid, false);
assert.deepEqual(providerRequestPolicy(DEFAULT_PROVIDER_SETTINGS).providerOrder, ['ninjabox', 'freeimage', 'x0']);
assert.deepEqual(normalizeWorkerPolicy().providerOrder, ['ninjabox', 'freeimage', 'x0']);
assert.deepEqual(normalizeWorkerPolicy({ providerOrder: ['ninjabox', 'x0'] }).providerOrder, ['ninjabox', 'x0']);

const success = (provider, name = provider) => ({
  provider,
  ok: true,
  url: `https://${provider}.test/${name}`,
  directUrl: `https://${provider}.test/direct/${name}`,
  error: null,
});
const failure = (provider) => ({ provider, ok: false, url: null, directUrl: null, error: `${provider} failed` });

const primaryItem = composeBundleItem({
  index: 0,
  photoId: 'primary',
  fileName: 'primary.jpg',
  attempts: [success('ninjabox')],
});
assert.equal(primaryItem.ok, true);
assert.equal(primaryItem.selectedProvider, 'ninjabox');
assert.deepEqual(primaryItem.links.map((link) => link.provider), ['ninjabox']);

const fallbackItem = composeBundleItem({
  index: 1,
  photoId: 'fallback',
  fileName: 'fallback.jpg',
  attempts: [failure('ninjabox'), success('freeimage')],
});
assert.equal(fallbackItem.ok, true);
assert.equal(fallbackItem.selectedProvider, 'freeimage');
assert.deepEqual(fallbackItem.links[0].replaces, ['ninjabox']);

const failedItem = composeBundleItem({
  index: 2,
  photoId: 'failed',
  fileName: 'failed.jpg',
  attempts: [failure('ninjabox'), failure('freeimage'), failure('x0')],
});
assert.equal(failedItem.ok, false);
assert.equal(failedItem.links.length, 0);

const files = [
  new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
  new File(['b'], 'b.jpg', { type: 'image/jpeg' }),
];

const primaryCalls = { ninjabox: [], freeimage: [], x0: [] };
const primaryBundle = await uploadBundle(files, ['a', 'b'], {
  ninjabox: async (batch) => {
    primaryCalls.ninjabox.push(batch[0].name);
    return {
      ok: true,
      galleryUrl: 'https://ninja.test/gallery',
      items: [{ url: `https://ninja.test/${batch[0].name}`, directUrl: `https://ninja.test/d/${batch[0].name}` }],
    };
  },
  freeimage: async (file) => { primaryCalls.freeimage.push(file.name); return success('freeimage', file.name); },
  x0: async (file) => { primaryCalls.x0.push(file.name); return success('x0', file.name); },
});
assert.deepEqual(primaryCalls.ninjabox.sort(), ['a.jpg', 'b.jpg']);
assert.deepEqual(primaryCalls.freeimage, []);
assert.deepEqual(primaryCalls.x0, []);
assert.ok(primaryBundle.items.every((item) => item.selectedProvider === 'ninjabox' && item.links.length === 1));

const fallbackCalls = [];
const freeimageFallbackBundle = await uploadBundle([files[0]], ['a'], {
  ninjabox: async () => { throw new Error('ninja down'); },
  freeimage: async (file) => { fallbackCalls.push(file.name); return success('freeimage', file.name); },
  x0: async () => { throw new Error('x0 must not run'); },
});
assert.deepEqual(fallbackCalls, ['a.jpg']);
assert.equal(freeimageFallbackBundle.items[0].selectedProvider, 'freeimage');
assert.deepEqual(freeimageFallbackBundle.items[0].attemptedProviders, ['ninjabox', 'freeimage']);

const x0Bundle = await uploadBundle([files[0]], ['a'], {
  ninjabox: async () => { throw new Error('ninja down'); },
  freeimage: async () => { throw new Error('free down'); },
  x0: async (file) => success('x0', file.name),
});
assert.equal(x0Bundle.items[0].selectedProvider, 'x0');
assert.deepEqual(x0Bundle.items[0].attemptedProviders, ['ninjabox', 'freeimage', 'x0']);

let disabledFallbackCalls = 0;
const primaryOnlyBundle = await uploadBundle([files[0]], ['a'], {
  ninjabox: async () => { throw new Error('ninja down'); },
  freeimage: async () => { disabledFallbackCalls += 1; return success('freeimage'); },
}, { providerOrder: ['ninjabox'] });
assert.equal(disabledFallbackCalls, 0);
assert.equal(primaryOnlyBundle.items[0].ok, false);

const cleanedEntries = files.map((file, index) => ({
  photoId: String(index + 1),
  file,
  originalFile: null,
  cleaned: true,
}));
const requestBatches = [];
const progressEvents = [];
const sequentialResults = await uploadCleanedPhotos(cleanedEntries, {
  proxyUrl: 'https://worker.test/api/upload',
  providerSettings: DEFAULT_PROVIDER_SETTINGS,
  onProgress: (event) => progressEvents.push({ type: event.type, photoId: event.photoId, completed: event.completed }),
  dependencies: {
    requestBundle: async (entries, _proxyUrl, _signal, policy) => {
      requestBatches.push(entries.map((entry) => entry.photoId));
      const entry = entries[0];
      return {
        target: 'bundle',
        providerOrder: policy.providerOrder,
        items: [{
          index: 0,
          photoId: entry.photoId,
          fileName: entry.file.name,
          selectedProvider: 'ninjabox',
          providerOrder: policy.providerOrder,
          attempts: [success('ninjabox', entry.photoId)],
          links: [{ provider: 'ninjabox', url: `https://ninja.test/${entry.photoId}` }],
          providers: { ninjabox: { ok: true }, freeimage: null, x0: null },
        }],
      };
    },
  },
});
assert.deepEqual(requestBatches, [['1'], ['2']]);
assert.deepEqual(progressEvents, [
  { type: 'started', photoId: '1', completed: 0 },
  { type: 'completed', photoId: '1', completed: 1 },
  { type: 'started', photoId: '2', completed: 1 },
  { type: 'completed', photoId: '2', completed: 2 },
]);
assert.equal(sequentialResults.get('1').selectedProvider, 'ninjabox');
assert.equal(sequentialResults.get('2').links.length, 1);

let continueCalls = 0;
const continuedResults = await uploadCleanedPhotos(cleanedEntries, {
  proxyUrl: 'https://worker.test/api/upload',
  dependencies: {
    requestBundle: async (entries) => {
      continueCalls += 1;
      if (entries[0].photoId === '1') throw new Error('first failed');
      return {
        target: 'bundle',
        providerOrder: ['ninjabox', 'freeimage', 'x0'],
        items: [{
          index: 0,
          photoId: '2',
          fileName: entries[0].file.name,
          selectedProvider: 'ninjabox',
          links: [{ provider: 'ninjabox', url: 'https://ninja.test/2' }],
          attempts: [success('ninjabox', '2')],
        }],
      };
    },
  },
});
assert.equal(continueCalls, 2);
assert.equal(continuedResults.get('1').links.length, 0);
assert.equal(continuedResults.get('2').links.length, 1);

await assert.rejects(
  () => uploadCleanedPhotos([{
    photoId: 'original',
    file: files[0],
    originalFile: files[0],
    cleaned: true,
  }], { proxyUrl: 'https://worker.test/' }),
  /только очищенные копии/,
);

const originalFetch = globalThis.fetch;
let inspectedUploadFields = null;
globalThis.fetch = async (_url, init) => {
  inspectedUploadFields = [...init.body.entries()].map(([key, value]) => ({
    key,
    value: value instanceof File ? value.name : String(value),
  }));
  return new Response(JSON.stringify({
    target: 'bundle',
    providerOrder: ['ninjabox', 'freeimage', 'x0'],
    items: [{
      index: 0,
      photoId: 'photo-1',
      fileName: 'gps-001.jpg',
      selectedProvider: 'ninjabox',
      links: [{ provider: 'ninjabox', url: 'https://ninja.test/photo-1' }],
      attempts: [success('ninjabox', 'photo-1')],
    }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
try {
  await requestUploadBundle([{
    photoId: 'photo-1',
    file: new File(['clean'], 'gps-001.jpg', { type: 'image/jpeg' }),
    internalName: 'index-5939',
  }], 'https://worker.test/', undefined, providerRequestPolicy(DEFAULT_PROVIDER_SETTINGS));
} finally {
  globalThis.fetch = originalFetch;
}
assert.deepEqual(inspectedUploadFields.filter((field) => field.key === 'files').map((field) => field.value), ['gps-001.jpg']);
assert.equal(inspectedUploadFields.some((field) => /5939|index-5939/.test(field.value)), false);
assert.deepEqual(inspectedUploadFields.find((field) => field.key === 'providerOrder')?.value, 'ninjabox,freeimage,x0');

const workerOverrides = {
  ninjabox: async (batch) => ({
    ok: true,
    galleryUrl: 'https://ninja.worker/gallery',
    items: batch.map((file) => ({ url: `https://ninja.worker/${file.name}`, directUrl: `https://ninja.worker/d/${file.name}` })),
  }),
};
const makeUploadRequest = (url, headers = {}) => {
  const formData = new FormData();
  formData.append('target', 'bundle');
  formData.append('providerOrder', 'ninjabox,freeimage,x0');
  formData.append('photoId', 'worker-a');
  formData.append('files', files[0], 'worker-a.jpg');
  return new Request(url, { method: 'POST', headers, body: formData });
};

const apiUploadResponse = await handleWorkerRequest(
  makeUploadRequest('https://gps.bruce-group.net/api/upload'),
  {},
  workerOverrides,
);
const apiUploadBody = await apiUploadResponse.json();
assert.equal(apiUploadResponse.status, 200);
assert.equal(apiUploadBody.items[0].selectedProvider, 'ninjabox');
assert.equal(apiUploadBody.items[0].photoId, 'worker-a');

const assetEnv = {
  ASSETS: {
    fetch: async (request) => {
      const pathname = new URL(request.url).pathname;
      if (pathname === '/' || pathname === '/index.html') return new Response('<!doctype html><title>GPS</title>', { headers: { 'Content-Type': 'text/html' } });
      if (pathname === '/assets/app.js') return new Response('console.log("gps")', { headers: { 'Content-Type': 'application/javascript' } });
      return new Response('missing', { status: 404 });
    },
  },
};
assert.equal((await handleWorkerRequest(new Request('https://gps.bruce-group.net/assets/app.js'), assetEnv)).status, 200);
assert.equal((await handleWorkerRequest(new Request('https://gps.bruce-group.net/history', { headers: { Accept: 'text/html' } }), assetEnv)).status, 200);
assert.equal((await handleWorkerRequest(new Request('https://gps.bruce-group.net/api/unknown'), assetEnv)).status, 404);

assert.equal(isAuthorizedRequest(new Request('https://gps.bruce-group.net/'), {}), true);
const guestAuthorization = `Basic ${Buffer.from('guest:guest-secret').toString('base64')}`;
assert.equal(isAuthorizedRequest(new Request('https://gps-guest.bruce-group.net/', {
  headers: { Authorization: guestAuthorization },
}), {
  BASIC_AUTH_REQUIRED: 'true',
  BASIC_AUTH_USERNAME: 'guest',
  BASIC_AUTH_PASSWORD: 'guest-secret',
}), true);
assert.equal((await handleWorkerRequest(new Request('https://gps-guest.bruce-group.net/', {
  headers: { Accept: 'text/html' },
}), {
  ...assetEnv,
  BASIC_AUTH_REQUIRED: 'true',
  BASIC_AUTH_USERNAME: 'guest',
  BASIC_AUTH_PASSWORD: 'guest-secret',
})).status, 401);
assert.equal((await handleWorkerRequest(new Request('https://gps-guest.bruce-group.net/', {
  headers: { Accept: 'text/html', Authorization: guestAuthorization },
}), {
  ...assetEnv,
  BASIC_AUTH_REQUIRED: 'true',
  BASIC_AUTH_USERNAME: 'guest',
  BASIC_AUTH_PASSWORD: 'guest-secret',
})).status, 200);
assert.equal(isAuthorizedRequest(new Request('https://gps.bruce-group.net/', {
  headers: { Authorization: 'Bearer app-token' },
}), { APP_ACCESS_TOKEN: 'app-token' }), true);

const providerOriginalFetch = globalThis.fetch;
const capturedProviderRequests = [];
const responseWithUrl = (body, init, url) => {
  const response = new Response(body, init);
  Object.defineProperty(response, 'url', { value: url });
  return response;
};
globalThis.fetch = async (url, init = {}) => {
  const requestUrl = String(url);
  const formFields = init.body instanceof FormData ? formDataPrivacyFields(init.body) : [];
  capturedProviderRequests.push({ url: requestUrl, headers: init.headers || {}, formFields });
  if (requestUrl === 'https://freeimage.host/api') {
    return responseWithUrl(`
      <h2>API Key</h2><div><input value="public-test-key"></div>
      <h3>Request URL</h3><div><input value="https://freeimage.host/api/1/upload"></div>
    `, { status: 200, headers: { 'Content-Type': 'text/html' } }, requestUrl);
  }
  if (requestUrl === 'https://freeimage.host/api/1/upload') {
    return responseWithUrl(JSON.stringify({
      status_code: 200,
      image: { url_viewer: 'https://freeimage.host/i/private', url: 'https://iili.io/private.jpg' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }, requestUrl);
  }
  if (requestUrl === 'https://ninjabox.org/') {
    return responseWithUrl(`
      <form action="https://ninjabox.org/put" method="post">
        <input type="hidden" name="csrf" value="test-token">
        <input name="files" type="file" multiple>
      </form>
    `, { status: 200, headers: { 'Content-Type': 'text/html' } }, requestUrl);
  }
  if (requestUrl === 'https://ninjabox.org/put') {
    return responseWithUrl('<a href="/i/private"><img src="/storage/private.jpg"></a>', { status: 200, headers: { 'Content-Type': 'text/html' } }, 'https://ninjabox.org/i/gallery');
  }
  if (requestUrl === 'https://x0.at/') {
    return responseWithUrl('https://x0.at/private.jpg\n', { status: 200, headers: { 'Content-Type': 'text/plain' } }, requestUrl);
  }
  throw new Error(`Unexpected provider URL: ${requestUrl}`);
};
try {
  const privateFile = new File(['private'], 'gps-001-secret.jpg', { type: 'image/jpeg' });
  await uploadFreeimage(privateFile);
  await uploadNinjabox([privateFile]);
  await uploadX0(privateFile);
} finally {
  globalThis.fetch = providerOriginalFetch;
}
for (const request of capturedProviderRequests) {
  assert.equal(assertProviderHeadersPrivate(request.headers), true);
  assert.equal(request.formFields.some((field) => /gps-001-secret/i.test(field.filename || '')), false);
}

console.log('Upload routing, fallback chain, progress and privacy tests passed');
