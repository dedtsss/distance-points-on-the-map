import assert from 'node:assert/strict';

import { parseFreeimageApiPage } from '../workers/host-proxy/freeimage.js';
import { parseNinjaboxForm, parseNinjaboxGallery } from '../workers/host-proxy/ninjabox.js';
import {
  composeBundleItem,
  handleWorkerRequest,
  isAuthorizedRequest,
  uploadBundle,
} from '../workers/host-proxy/worker.js';
import { uploadCleanedPhotos } from '../src/features/upload/uploadService.js';
import { validateProviderSettings } from '../src/features/upload/providerPolicy.js';

const freeimage = parseFreeimageApiPage(`
  <h2>API Key</h2><div><input value="public-test-key"></div>
  <h3>Request URL</h3><div><input value="https://freeimage.host/api/1/upload"></div>
`);
assert.deepEqual(freeimage, { key: 'public-test-key', endpoint: 'https://freeimage.host/api/1/upload' });

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
  <link href="/css/site.css">
  <a href="/i/photo-1"><img src="/storage/gallery/one.png"></a>
  <a href="/i/photo-2"><img src="/storage/gallery/two.png"></a>
`, 'https://ninjabox.org/gallery');
assert.deepEqual(gallery, [
  { url: 'https://ninjabox.org/i/photo-1', directUrl: 'https://ninjabox.org/storage/gallery/one.png' },
  { url: 'https://ninjabox.org/i/photo-2', directUrl: 'https://ninjabox.org/storage/gallery/two.png' },
]);

const success = { ok: true, url: 'https://example.test/view', directUrl: 'https://example.test/image.jpg' };
const failed = { ok: false, url: null, directUrl: null, error: 'failed' };
const fallback = { ok: true, url: 'https://x0.at/test.jpg', directUrl: 'https://x0.at/test.jpg' };

const normal = composeBundleItem({ index: 0, photoId: 'a', fileName: 'a.jpg', freeimage: success, ninjabox: success });
assert.equal(normal.ok, true);
assert.deepEqual(normal.links.map((item) => item.provider), ['freeimage', 'ninjabox']);
assert.equal(normal.providers.x0, null);

const replaced = composeBundleItem({ index: 1, photoId: 'b', fileName: 'b.jpg', freeimage: failed, ninjabox: success, fallback });
assert.equal(replaced.ok, true);
assert.deepEqual(replaced.links.map((item) => item.provider), ['ninjabox', 'x0']);
assert.deepEqual(replaced.links[1].replaces, ['freeimage']);

const partial = composeBundleItem({ index: 2, photoId: 'c', fileName: 'c.jpg', freeimage: failed, ninjabox: failed, fallback });
assert.equal(partial.ok, false);
assert.equal(partial.partial, true);
assert.deepEqual(partial.links[0].replaces, ['freeimage', 'ninjabox']);

const files = [
  new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
  new File(['b'], 'b.jpg', { type: 'image/jpeg' }),
];
const calls = { freeimage: [], ninjabox: 0, x0: [] };
const bundle = await uploadBundle(files, ['a', 'b'], {
  freeimage: async (file) => {
    calls.freeimage.push(file.name);
    return { provider: 'freeimage', ok: true, url: `https://free.test/${file.name}`, directUrl: `https://free.test/d/${file.name}` };
  },
  ninjabox: async (batch) => {
    calls.ninjabox += 1;
    return {
      ok: true,
      galleryUrl: 'https://ninja.test/gallery',
      items: batch.map((file) => ({ url: `https://ninja.test/${file.name}`, directUrl: `https://ninja.test/d/${file.name}` })),
    };
  },
  x0: async (file) => {
    calls.x0.push(file.name);
    return { provider: 'x0', ok: true, url: `https://x0.test/${file.name}`, directUrl: `https://x0.test/${file.name}` };
  },
});
assert.deepEqual(calls.freeimage, ['a.jpg', 'b.jpg']);
assert.equal(calls.ninjabox, 1);
assert.deepEqual(calls.x0, []);
assert.ok(bundle.items.every((item) => item.links.length === 2));

const fallbackCalls = [];
const fallbackBundle = await uploadBundle([files[0]], ['a'], {
  freeimage: async () => { throw new Error('freeimage down'); },
  ninjabox: async () => ({ ok: true, galleryUrl: 'https://ninja.test/gallery', items: [{ url: 'https://ninja.test/a', directUrl: 'https://ninja.test/d/a' }] }),
  x0: async (file) => {
    fallbackCalls.push(file.name);
    return { provider: 'x0', ok: true, url: 'https://x0.test/a', directUrl: 'https://x0.test/a' };
  },
});
assert.deepEqual(fallbackCalls, ['a.jpg']);
assert.deepEqual(fallbackBundle.items[0].links.map((link) => link.provider), ['ninjabox', 'x0']);

let selectedNinjaCalls = 0;
let selectedX0Calls = 0;
const selectedBundle = await uploadBundle([files[0]], ['selected'], {
  freeimage: async () => ({ provider: 'freeimage', ok: true, url: 'https://free.test/selected', directUrl: 'https://free.test/d/selected' }),
  ninjabox: async () => { selectedNinjaCalls += 1; throw new Error('must not run'); },
  x0: async () => { selectedX0Calls += 1; throw new Error('must not run'); },
}, { selectedProviders: ['freeimage'], includeX0: false, fallback: 'none' });
assert.equal(selectedNinjaCalls, 0);
assert.equal(selectedX0Calls, 0);
assert.deepEqual(selectedBundle.selectedProviders, ['freeimage']);
assert.deepEqual(selectedBundle.items[0].links.map((link) => link.provider), ['freeimage']);

let mandatoryX0Calls = 0;
const mandatoryBundle = await uploadBundle([files[0]], ['mandatory'], {
  freeimage: async () => ({ provider: 'freeimage', ok: true, url: 'https://free.test/mandatory', directUrl: 'https://free.test/d/mandatory' }),
  x0: async () => {
    mandatoryX0Calls += 1;
    return { provider: 'x0', ok: true, url: 'https://x0.test/mandatory', directUrl: 'https://x0.test/mandatory' };
  },
}, { selectedProviders: ['freeimage'], includeX0: true, fallback: 'none' });
assert.equal(mandatoryX0Calls, 1);
assert.deepEqual(mandatoryBundle.items[0].links.map((link) => link.provider), ['freeimage', 'x0']);
assert.equal(mandatoryBundle.items[0].links[1].role, 'required');

let disabledFallbackCalls = 0;
const disabledFallbackBundle = await uploadBundle([files[0]], ['disabled'], {
  freeimage: async () => { throw new Error('freeimage down'); },
  x0: async () => { disabledFallbackCalls += 1; return fallback; },
}, { selectedProviders: ['freeimage'], includeX0: false, fallback: 'none' });
assert.equal(disabledFallbackCalls, 0);
assert.equal(disabledFallbackBundle.items[0].links.length, 0);
assert.equal(validateProviderSettings({ freeimage: false, ninjabox: false }).valid, false);
assert.equal(validateProviderSettings({ freeimage: true, ninjabox: false }).valid, true);

const cleanedEntries = files.map((file, index) => ({ photoId: String(index), file, originalFile: null, cleaned: true }));
let requestEntries = null;
let requestPolicy = null;
const normalized = await uploadCleanedPhotos(cleanedEntries, {
  proxyUrl: 'https://worker.test/',
  providerSettings: { freeimage: true, ninjabox: false, includeX0: true, fallbackX0: false },
  dependencies: {
    requestBundle: async (entries, _proxyUrl, _signal, policy) => {
      requestEntries = entries;
      requestPolicy = policy;
      return {
        target: 'bundle',
        selectedProviders: ['freeimage'],
        includeX0: true,
        fallback: 'none',
        ninjaboxGalleryUrl: 'https://ninja.test/gallery',
        items: entries.map((entry, index) => ({
          index,
          photoId: entry.photoId,
          fileName: entry.file.name,
          links: [
            { provider: 'freeimage', url: `https://free.test/${index}` },
            { provider: 'ninjabox', url: `https://ninja.test/${index}` },
          ],
          providers: { freeimage: { ok: true }, ninjabox: { ok: true }, x0: null },
        })),
      };
    },
  },
});
assert.equal(requestEntries, cleanedEntries);
assert.equal(requestPolicy.providers, 'freeimage');
assert.equal(requestPolicy.includeX0, true);
assert.equal(requestPolicy.fallback, 'none');
assert.equal(normalized.get('0').freeimageUrl, 'https://free.test/0');
assert.equal(normalized.get('0').ninjaboxUrl, 'https://ninja.test/0');
assert.equal(normalized.get('0').fallbackUrl, '');

const mismatched = await uploadCleanedPhotos([cleanedEntries[0]], {
  proxyUrl: 'https://worker.test/',
  dependencies: {
    requestBundle: async () => ({
      target: 'bundle',
      items: [{
        index: 1,
        photoId: '0',
        fileName: 'wrong.jpg',
        links: [{ provider: 'ninjabox', url: 'https://ninja.test/wrong' }],
        providers: { ninjabox: { ok: true } },
      }],
    }),
  },
});
assert.equal(mismatched.get('0').links.length, 1);
assert.match(mismatched.get('0').technicalError, /order mismatch/);
assert.match(mismatched.get('0').uploadWarnings.join(' '), /photoId/);

await assert.rejects(
  () => uploadCleanedPhotos([{
    photoId: 'original',
    file: files[0],
    originalFile: files[0],
    cleaned: true,
  }], { proxyUrl: 'https://worker.test/' }),
  /только очищенные копии/,
);

const workerProviderOverrides = {
  freeimage: async (file) => ({ provider: 'freeimage', ok: true, url: `https://free.worker/${file.name}`, directUrl: `https://free.worker/d/${file.name}` }),
  ninjabox: async (batch) => ({
    ok: true,
    galleryUrl: 'https://ninja.worker/gallery',
    items: batch.map((file) => ({ url: `https://ninja.worker/${file.name}`, directUrl: `https://ninja.worker/d/${file.name}` })),
  }),
};
const makeUploadRequest = (url) => {
  const formData = new FormData();
  formData.append('target', 'bundle');
  formData.append('photoId', 'worker-a');
  formData.append('files', files[0], 'worker-a.jpg');
  return new Request(url, { method: 'POST', body: formData });
};
const apiUploadResponse = await handleWorkerRequest(
  makeUploadRequest('https://gps.brus-group.net/api/upload'),
  {},
  workerProviderOverrides,
);
const apiUploadBody = await apiUploadResponse.json();
assert.equal(apiUploadResponse.status, 200);
assert.equal(apiUploadBody.target, 'bundle');
assert.equal(apiUploadBody.items[0].photoId, 'worker-a');

const legacyRootUploadResponse = await handleWorkerRequest(
  makeUploadRequest('https://gps.brus-group.net/'),
  {},
  workerProviderOverrides,
);
assert.equal(legacyRootUploadResponse.status, 200);

const unknownApiResponse = await handleWorkerRequest(new Request('https://gps.brus-group.net/api/unknown'), {});
assert.equal(unknownApiResponse.status, 404);
assert.match(await unknownApiResponse.text(), /Unknown API route/);

const assetEnv = {
  ASSETS: {
    fetch: async (request) => {
      const path = new URL(request.url).pathname;
      if (path === '/' || path === '/index.html') return new Response('<!doctype html><title>GPS</title>', { headers: { 'Content-Type': 'text/html' } });
      if (path === '/assets/app.js') return new Response('console.log("gps")', { headers: { 'Content-Type': 'application/javascript' } });
      return new Response('missing', { status: 404 });
    },
  },
};
const assetResponse = await handleWorkerRequest(new Request('https://gps.brus-group.net/assets/app.js'), assetEnv);
assert.equal(assetResponse.status, 200);
assert.match(await assetResponse.text(), /gps/);
const spaResponse = await handleWorkerRequest(new Request('https://gps.brus-group.net/history/deep-link', {
  headers: { Accept: 'text/html' },
}), assetEnv);
assert.equal(spaResponse.status, 200);
assert.match(await spaResponse.text(), /GPS/);

assert.equal(isAuthorizedRequest(new Request('https://gps.brus-group.net/'), { BASIC_AUTH_PASSWORD: 'secret' }), false);
const basicAuthorization = `Basic ${Buffer.from('owner:secret').toString('base64')}`;
assert.equal(isAuthorizedRequest(new Request('https://gps.brus-group.net/', {
  headers: { Authorization: basicAuthorization },
}), { BASIC_AUTH_PASSWORD: 'secret', BASIC_AUTH_USERNAME: 'owner' }), true);
const unauthorizedResponse = await handleWorkerRequest(new Request('https://gps.brus-group.net/'), {
  ...assetEnv,
  BASIC_AUTH_PASSWORD: 'secret',
});
assert.equal(unauthorizedResponse.status, 401);
assert.match(unauthorizedResponse.headers.get('WWW-Authenticate'), /Basic/);
const authorizedResponse = await handleWorkerRequest(new Request('https://gps.brus-group.net/', {
  headers: { Authorization: basicAuthorization },
}), {
  ...assetEnv,
  BASIC_AUTH_PASSWORD: 'secret',
});
assert.equal(authorizedResponse.status, 200);
const bearerResponse = await handleWorkerRequest(new Request('https://gps.brus-group.net/', {
  headers: { Authorization: 'Bearer app-token' },
}), {
  ...assetEnv,
  APP_ACCESS_TOKEN: 'app-token',
});
assert.equal(bearerResponse.status, 200);

console.log('Upload routing tests passed');
