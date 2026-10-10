import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { splitBatch } from '../src/core/batch.js';

const server = await createServer({ configFile: new URL('../vite.config.js', import.meta.url).pathname,
  root: new URL('..', import.meta.url).pathname, logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await page.goto(base);
  const cases = [
    { name: 'black-bottom-right-overlay-crop.jpg', latitude: 64.604344, longitude: 30.591954 },
    { name: 'gray-bottom-caption-overlay-crop.jpg', latitude: 64.60271, longitude: 30.61999 },
    { name: 'black-bottom-right-overlay-crop.jpg', latitude: 64.604344, longitude: 30.591954 },
  ];
  const photos = [];
  for (const item of cases) {
    const result = await page.evaluate(async ({ baseUrl, name }) => {
      const { readPhoto } = await import(`${baseUrl}src/core/readPhoto.js`);
      const bytes = await (await fetch(`${baseUrl}tests/fixtures/${name}`)).arrayBuffer();
      const file = new File([bytes], name, { type: 'image/jpeg' });
      const parsed = await readPhoto(file);
      return { size: file.size, ...parsed };
    }, { baseUrl: base, name: item.name });
    console.log(item.name, JSON.stringify(result));
    assert.ok(result.size > 100_000);
    assert.ok(Math.abs(result.coordinates.latitude - item.latitude) < 0.00001, item.name);
    assert.ok(Math.abs(result.coordinates.longitude - item.longitude) < 0.00001, item.name);
    photos.push({ id: String(photos.length + 1), number: photos.length + 1, fileName: item.name, ...result });
  }
  assert.equal(photos[0].indexFromOcr, '5939');
  assert.equal(photos[0].indexStatus, 'found');
  assert.equal(photos[1].indexFromOcr, null);
  const grouped = splitBatch(photos);
  assert.deepEqual([grouped.main.length, grouped.reserve.length, grouped.unresolved.length], [1, 1, 1]);
  assert.equal(grouped.remainingConflicts.length, 0);
} finally {
  await browser.close();
  await server.close();
}
