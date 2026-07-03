import assert from 'node:assert/strict';

import { parseFreeimageApiPage } from '../workers/host-proxy/freeimage.js';
import { parseNinjaboxForm, parseNinjaboxGallery } from '../workers/host-proxy/ninjabox.js';
import { composeBundleItem } from '../workers/host-proxy/worker.js';

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

console.log('Upload routing tests passed');
