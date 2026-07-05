import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, devices } from 'playwright';

const photoDir = process.env.REAL_PHOTOS_DIR;
if (!photoDir) throw new Error('REAL_PHOTOS_DIR is required');
const files = (await readdir(photoDir))
  .filter((name) => /\.jpe?g$/i.test(name))
  .sort((left, right) => left.localeCompare(right, 'en', { numeric: true }))
  .map((name) => resolve(photoDir, name));
if (files.length === 0) throw new Error('No JPEG files found');

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ...devices['Pixel 7'], locale: 'ru-RU' });
const page = await context.newPage();
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(error.message));

const multipartValues = (request, fieldName) => {
  const body = request.postDataBuffer()?.toString('latin1') || '';
  const expression = new RegExp(`name="${fieldName}"\\r\\n\\r\\n([^\\r\\n]+)`, 'g');
  return [...body.matchAll(expression)].map((match) => match[1]);
};

await page.route('https://spring-mouse-8d81.dvabobra2014.workers.dev/**', async (route) => {
  const request = route.request();
  const photoIds = multipartValues(request, 'photoId');
  const body = request.postDataBuffer()?.toString('latin1') || '';
  const filenames = [...body.matchAll(/filename="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(photoIds.length, files.length);
  assert.deepEqual(filenames, files.map((_, index) => `gps-${String(index + 1).padStart(3, '0')}.jpg`));
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      target: 'bundle',
      items: photoIds.map((photoId, index) => ({
        index,
        photoId,
        fileName: filenames[index],
        ok: true,
        partial: false,
        links: [
          { provider: 'freeimage', role: 'primary', url: `https://free.test/${index + 1}` },
          { provider: 'ninjabox', role: 'primary', url: `https://ninja.test/${index + 1}` },
        ],
        providers: { freeimage: { ok: true }, ninjabox: { ok: true }, x0: null },
      })),
    }),
  });
});

await page.goto('http://127.0.0.1:4173/distance-points-on-the-map/?debug=1', { waitUntil: 'networkidle' });
await page.locator('input[type=file]').setInputFiles(files);
await page.locator('.photo-thumbnail').first().waitFor({ timeout: 30_000 });
await page.getByRole('button', { name: 'Только распознать координаты' }).click();
await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent.includes('Очистить metadata') && !button.disabled), null, { timeout: 600_000 });
await page.getByRole('button', { name: 'Очистить metadata' }).click();
await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent.includes('Загрузить очищенные') && !button.disabled), null, { timeout: 120_000 });
await page.getByRole('button', { name: 'Загрузить очищенные' }).click();
await page.getByText('https://free.test/1', { exact: true }).waitFor({ timeout: 120_000 });

const results = [];
const cards = page.locator('.photo-result');
for (let index = 0; index < files.length; index += 1) {
  const card = cards.nth(index);
  await card.locator('details').evaluate((node) => { node.open = true; });
  const debug = JSON.parse(await card.locator('pre').textContent());
  results.push({
    number: index + 1,
    coordinates: await card.locator('.result-fields > div').first().locator('dd').textContent(),
    quality: await card.locator('.coordinate-quality').textContent(),
    ocrStatus: debug.gps?.ocr?.ocrStatus || null,
    attempts: debug.gps?.ocr?.attempts?.length || 0,
    cleanupMethod: debug.cleanup?.selectedCleanupPath || debug.cleanup?.method,
    uploaded: /Загружено/.test(await card.locator('.status-label').textContent()),
  });
}

assert.equal(results.every((result) => result.cleanupMethod === 'binary-jpeg-strip'), true);
assert.equal(results.every((result) => result.uploaded), true);
assert.deepEqual(errors, []);
console.log(JSON.stringify(results, null, 2));

await context.close();
await browser.close();
