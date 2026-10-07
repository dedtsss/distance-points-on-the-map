import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { handleNinjaboxRelay } from '../relay/worker.js';

const server = await createServer({ configFile: new URL('../vite.config.js', import.meta.url).pathname,
  root: new URL('..', import.meta.url).pathname, logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
// Recognition has separate real-JPEG OCR coverage. Keep this UI flow deterministic.
await page.route('**/src/core/readPhoto.js', (route) => route.fulfill({ contentType: 'application/javascript', body: `
export async function readPhoto(file) {
  const n = Number(file.name.match(/source-(\\d+)/)[1]);
  return { coordinates: { latitude: 64, longitude: 30 + (n <= 3 ? 0 : n * .001) },
    coordinateQuality: 'confident', gpsSource: 'exif', gpsStatus: 'done',
    indexFromOcr: String(6880 + n), indexStatus: 'found', orientation: 1,
    accuracyMeters: n === 2 ? 1 : null,
    captureTimeMs: 1700000000000 + n * 1000, captureTimeSource: 'exif' };
}` }));
const batches = [];
await page.route('https://*.workers.dev/v1/ninjabox', async (route) => {
  if (route.request().method() === 'OPTIONS') {
    await route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' } });
    return;
  }
  const request = new Request(route.request().url(), { method: 'POST', headers: route.request().headers(), body: route.request().postDataBuffer() });
  const response = await handleNinjaboxRelay(request, async (files) => {
    batches.push(files.map((file) => file.name));
    return { ok: true, galleryUrl: 'https://ninjabox.org/ed8ae0b8-9373-4dc0-a454-99e5f57a0578',
      items: files.map((_, index) => ({ url: `https://ninjabox.org/i/batch-${batches.length}-member-${index}` })) };
  });
  await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
});

try {
  await page.goto(server.resolvedUrls.local[0]);
  await page.locator('ion-select').evaluate((element) => element.dispatchEvent(new CustomEvent('ionChange', { detail: { value: 'ninjabox' }, bubbles: true })));
  const buffer = await readFile(new URL('fixtures/representative-6300.jpg', import.meta.url));
  await page.locator('input[type=file]').first().setInputFiles(Array.from({ length: 10 }, (_, i) => ({ name: `source-${String(i + 1).padStart(2, '0')}.jpg`, mimeType: 'image/jpeg', buffer })));
  await page.getByRole('button', { name: 'Обработать фото', exact: true }).click();
  await page.getByRole('heading', { name: 'Проверка точек' }).waitFor();
  const cards = page.locator('.result-photo-card');
  assert.equal(await cards.count(), 8);
  assert.equal(await page.locator('.point-count').textContent(), '10 фото → 8 точек');
  assert.equal(await cards.first().locator('.photo-identity').textContent(), '#6882');
  assert.equal(await cards.first().locator('.photo-thumbnail').count(), 3);
  assert.equal(batches.length, 0, 'review must precede any publication');
  await cards.first().getByRole('button', { name: 'Разделить', exact: true }).click();
  assert.equal(await cards.count(), 10);
  assert.equal(await page.locator('ion-badge').filter({ hasText: 'Резерв' }).textContent(), 'Резерв 2');
  assert.deepEqual(await page.locator('.point-section-title').allTextContents(), ['Основные8', 'Резерв2']);
  assert.equal(await page.locator('.point-section-reserve .reserve-reasons').count(), 2);
  assert.match(await page.locator('.point-section-reserve .reserve-reasons').first().textContent(), /Конфликт: #6881 · 0\.0 м/);
  await page.getByRole('button', { name: 'Со следующей #6882', exact: true }).click();
  assert.equal(await cards.count(), 9);
  const reserve6883 = cards.filter({ has: page.locator('.photo-identity', { hasText: '#6883' }) });
  await reserve6883.getByRole('button', { name: 'С предыдущей #6882', exact: true }).click();
  assert.equal(await cards.count(), 8);
  assert.equal(await cards.first().locator('.photo-identity').textContent(), '#6882');
  assert.equal(await page.locator('ion-badge').filter({ hasText: 'Резерв' }).textContent(), 'Резерв 0');
  const removable = cards.filter({ has: page.locator('.photo-identity', { hasText: '#6884' }) });
  await removable.getByRole('button', { name: 'Убрать', exact: true }).click();
  assert.equal(await cards.count(), 7);
  assert.equal(await page.locator('.point-count').textContent(), '9 фото → 7 точек');
  await page.getByRole('button', { name: 'Вернуть', exact: true }).click();
  assert.equal(await cards.count(), 8);
  assert.equal(await page.locator('.point-count').textContent(), '10 фото → 8 точек');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.screenshot({ path: '/tmp/darkfoto-038-review.png', fullPage: true });
  await page.getByRole('button', { name: 'Опубликовать 8 точек', exact: true }).click();
  await page.getByRole('heading', { name: 'Результат', exact: true }).waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.result-photo-card a')].length === 8);
  assert.equal(batches.length, 8);
  assert.deepEqual(batches[0], ['6882-01.jpg', '6882-02.jpg', '6882-03.jpg']);
  assert.equal(await cards.first().locator('a').getAttribute('href'), 'https://ninjabox.org/ed8ae0b8-9373-4dc0-a454-99e5f57a0578');
  assert.equal(await cards.locator('a').count(), 8);
  assert.equal(await page.locator('.point-actions').count(), 0);
  assert.equal(await page.locator('.primary-action').getAttribute('disabled') !== null, true);
  await cards.first().locator('.photo-thumbnail').nth(1).click();
  await page.locator('.image-gesture-area img').waitFor();
  await page.getByRole('button', { name: 'Увеличить' }).click();
  assert.match(await page.locator('.image-gesture-area img').getAttribute('style'), /scale\(1.5\)/);
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('button', { name: 'Посмотреть', exact: true }).click();
  await page.locator('.txt-preview').waitFor();
  const txt = await page.locator('.txt-preview').textContent();
  assert.equal((txt.match(/^#/gm) || []).length, 8);
  assert.equal((txt.match(/ed8ae0b8/g) || []).length, 1);
  await page.locator('.txt-modal-content').evaluate((element) => element.scrollToBottom(0));
  await page.waitForFunction(() => {
    const rect = document.querySelector('.txt-actions')?.getBoundingClientRect();
    return rect && rect.top >= 0 && rect.bottom <= window.innerHeight + 1;
  });
  const footer = await page.locator('.txt-actions').boundingBox();
  assert.ok(footer.y >= 0 && footer.y + footer.height <= 813);
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.setViewportSize({ width: 812, height: 375 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  assert.equal(await cards.count(), 8);
  assert.deepEqual(errors, []);
  console.log('375×812 / landscape: review 10→8, split/merge, no early uploads, 8 sanitized point POSTs/links, local viewer, TXT footer: PASS');
} finally {
  await browser.close();
  await server.close();
}
