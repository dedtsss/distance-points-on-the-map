import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';

const outputDir = dirname(fileURLToPath(import.meta.url));
await mkdir(outputDir, { recursive: true });
const baseUrl = process.env.AUDIT_URL || 'http://127.0.0.1:4173/distance-points-on-the-map/';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ...devices['Pixel 7'],
  locale: 'ru-RU',
  permissions: ['clipboard-read', 'clipboard-write'],
});
const page = await context.newPage();
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(error.message));

const makeJpeg = async (label) => Buffer.from(await page.evaluate(async (text) => {
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 600;
  const context2d = canvas.getContext('2d');
  context2d.fillStyle = '#dbeafe';
  context2d.fillRect(0, 0, 900, 600);
  context2d.fillStyle = '#174b7a';
  context2d.font = 'bold 44px Arial';
  context2d.fillText(text, 60, 100);
  const blob = await new Promise((resolveBlob) => canvas.toBlob(resolveBlob, 'image/jpeg', 0.86));
  return [...new Uint8Array(await blob.arrayBuffer())];
}, label));

const multipartValues = (request, fieldName) => {
  const body = request.postDataBuffer()?.toString('latin1') || '';
  const expression = new RegExp(`name="${fieldName}"\\r\\n\\r\\n([^\\r\\n]+)`, 'g');
  return [...body.matchAll(expression)].map((match) => match[1]);
};
const multipartFilenames = (request) => {
  const body = request.postDataBuffer()?.toString('latin1') || '';
  return [...body.matchAll(/filename="([^"]+)"/g)].map((match) => match[1]);
};

await page.route('https://spring-mouse-8d81.dvabobra2014.workers.dev/**', async (route) => {
  const request = route.request();
  const photoIds = multipartValues(request, 'photoId');
  const filenames = multipartFilenames(request);
  assert.deepEqual(multipartValues(request, 'providers'), ['freeimage']);
  assert.deepEqual(multipartValues(request, 'includeX0'), ['true']);
  assert.deepEqual(multipartValues(request, 'fallback'), ['none']);
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      target: 'bundle',
      selectedProviders: ['freeimage'],
      includeX0: true,
      fallback: 'none',
      items: photoIds.map((photoId, index) => ({
        index,
        photoId,
        fileName: filenames[index],
        ok: true,
        partial: false,
        links: [
          { provider: 'freeimage', role: 'primary', url: `https://free.test/${index + 1}` },
          { provider: 'x0', role: 'required', url: `https://x0.test/${index + 1}`, replaces: [] },
        ],
        providers: { freeimage: { ok: true }, ninjabox: null, x0: { ok: true } },
      })),
    }),
  });
});

await page.goto(baseUrl, { waitUntil: 'networkidle' });
const files = [
  { name: 'first.jpg', mimeType: 'image/jpeg', buffer: await makeJpeg('FIRST') },
  { name: 'second.jpg', mimeType: 'image/jpeg', buffer: await makeJpeg('SECOND') },
];
await page.locator('input[type=file]').setInputFiles(files);
await page.locator('.photo-thumbnail').first().waitFor();
assert.equal(await page.locator('.photo-thumbnail').count(), 2);

await page.getByLabel('Freeimage').uncheck();
await page.getByLabel('Ninjabox').uncheck();
assert.equal(await page.getByRole('button', { name: 'Проверить и загрузить' }).isDisabled(), true);
assert.equal(await page.getByText('Выберите хотя бы один основной сервис загрузки.').isVisible(), true);
await page.getByLabel('Freeimage').check();
await page.getByLabel('x0.at как обязательная третья ссылка').check();
await page.getByLabel('Использовать x0.at как fallback при ошибке').uncheck();

await page.getByRole('button', { name: 'Проверить и загрузить' }).click();
await page.getByRole('button', { name: 'Обработка завершена' }).waitFor({ timeout: 180_000 });
assert.equal(await page.locator('.full-link-block').count(), 4);
assert.equal(await page.getByText('https://free.test/1', { exact: true }).isVisible(), true);
assert.equal(await page.getByText('https://x0.test/1', { exact: true }).isVisible(), true);

await page.getByRole('button', { name: 'Сформировать все ссылки' }).click();
const expectedLinks = [
  'https://free.test/1',
  'https://x0.test/1',
  '',
  'https://free.test/2',
  'https://x0.test/2',
].join('\n');
assert.equal(await page.locator('.all-links-output').inputValue(), expectedLinks);
const stored = await page.evaluate(() => localStorage.getItem('gps-checker-last-session-v1'));
assert.ok(stored);
for (const forbidden of ['sourceBuffer', 'stableBlob', 'stableFile', 'cleanedBlob', 'previewObjectUrl', '"debug"']) {
  assert.equal(stored.includes(forbidden), false);
}
await page.screenshot({ path: resolve(outputDir, '09-iteration2-results.png'), fullPage: true });

await page.reload({ waitUntil: 'networkidle' });
assert.match(await page.locator('.session-prompt').textContent(), /Найден последний результат/);
await page.getByRole('button', { name: 'Восстановить' }).click();
assert.equal(await page.locator('.photo-result').count(), 2);
assert.equal(await page.locator('.photo-thumbnail').count(), 2);
assert.equal(await page.getByText('https://free.test/1', { exact: true }).isVisible(), true);
await page.locator('.photo-results').scrollIntoViewIfNeeded();
await page.screenshot({ path: resolve(outputDir, '10-iteration2-session-restored.png'), fullPage: false });

await page.getByRole('button', { name: 'Очистить результат' }).last().click();
assert.equal(await page.locator('.photo-result').count(), 0);
assert.equal(await page.evaluate(() => localStorage.getItem('gps-checker-last-session-v1')), null);
assert.deepEqual(errors, []);

await context.close();
await browser.close();
console.log('Iteration 2 browser check passed');
