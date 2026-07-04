import assert from 'node:assert/strict';

import { parseFreeimageApiPage } from '../workers/host-proxy/freeimage.js';
import { parseNinjaboxForm, parseNinjaboxGallery } from '../workers/host-proxy/ninjabox.js';
import { composeBundleItem, uploadBundle } from '../workers/host-proxy/worker.js';
import { uploadCleanedPhotos } from '../src/features/upload/uploadService.js';

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

const cleanedEntries = files.map((file, index) => ({ photoId: String(index), file, originalFile: null, cleaned: true }));
let requestEntries = null;
const normalized = await uploadCleanedPhotos(cleanedEntries, {
  proxyUrl: 'https://worker.test/',
  dependencies: {
    requestBundle: async (entries) => {
      requestEntries = entries;
      return {
        target: 'bundle',
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
assert.equal(mismatched.get('0').links.length, 0);
assert.match(mismatched.get('0').technicalError, /order mismatch/);

console.log('Upload routing tests passed');
