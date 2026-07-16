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
  context2d.fillStyle = '#050505';
  context2d.fillRect(390, 470, 510, 130);
  context2d.fillStyle = '#fff';
  context2d.font = 'bold 29px Arial';
  context2d.fillText('64,604344N 30,591954E +3,48m', 410, 520);
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

const debugUrl = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}debug=1`;
await page.goto(debugUrl, { waitUntil: 'networkidle' });
assert.match(await page.locator('.build-info').textContent(), /Версия приложения/);
const files = [
  { name: 'first.jpg', mimeType: 'image/jpeg', buffer: await makeJpeg('FIRST') },
  { name: 'second.jpg', mimeType: 'image/jpeg', buffer: await makeJpeg('SECOND') },
];
await page.locator('input[type=file]').setInputFiles(files);
await page.locator('.photo-thumbnail').first().waitFor();
assert.equal(await page.locator('.photo-thumbnail').count(), 2);
assert.equal(await page.getByRole('heading', { name: 'Куда загружать' }).isVisible(), true);
await page.waitForTimeout(200);
const bufferedSession = JSON.parse(await page.evaluate(() => localStorage.getItem('gps-checker-last-session-v1')));
assert.equal(bufferedSession.photos.length, 2);
assert.equal(bufferedSession.photos[0].status, 'buffered');

await page.getByLabel('Freeimage').uncheck();
await page.getByLabel('Ninjabox').uncheck();
assert.equal(await page.getByRole('button', { name: 'Проверить и загрузить всё' }).isDisabled(), true);
assert.equal(await page.getByText('Выберите хотя бы один основной сервис загрузки.').isVisible(), true);
await page.getByLabel('Freeimage').check();
await page.getByLabel('x0.at как обязательная третья ссылка').check();
await page.getByLabel('Использовать x0.at как fallback при ошибке').uncheck();

await page.getByRole('button', { name: 'Только распознать координаты' }).click();
await page.waitForFunction(() => {
  const qualities = [...document.querySelectorAll('.coordinate-quality')];
  return qualities.length === 2 && qualities.every((node) => node.textContent.includes('Координаты найдены уверенно'));
}, null, { timeout: 180_000 });
assert.equal(await page.locator('.result-fields dd').filter({ hasText: '64.604344, 30.591954' }).count(), 2);
await page.locator('.overlay-debug-details').first().getByText('Overlay OCR debug').click();
assert.ok(await page.locator('.overlay-debug-attempt').count() >= 1);
assert.match(await page.locator('.overlay-debug-fields').first().textContent(), /x: \d+, y: \d+, width: \d+, height: \d+/);
assert.equal(await page.locator('.overlay-debug-attempt').first().locator('img').count(), 2);
assert.match(await page.locator('.overlay-debug-text').first().textContent(), /64\.604344N\s*30\.591954E/);

await page.getByRole('button', { name: 'Исправить координаты' }).first().click();
await page.getByLabel('Latitude фото 1').fill('62,100000');
await page.getByLabel('Longitude фото 1').fill('34,100000');
await page.getByRole('button', { name: 'Применить координаты' }).first().click();
assert.equal(await page.getByText('Координаты заданы вручную').first().isVisible(), true);

await page.getByRole('button', { name: 'Очистить metadata' }).click();
await page.getByText('Metadata очищены').first().waitFor({ timeout: 60_000 });
assert.equal(await page.getByRole('button', { name: 'Загрузить очищенные' }).isDisabled(), false);
await page.getByRole('button', { name: 'Загрузить очищенные' }).click();
await page.getByText('https://free.test/1', { exact: true }).waitFor({ timeout: 60_000 });
assert.equal(await page.locator('.full-link-block').count(), 4);
assert.equal(await page.getByText('https://free.test/1', { exact: true }).isVisible(), true);
assert.equal(await page.getByText('https://x0.test/1', { exact: true }).isVisible(), true);

await page.waitForTimeout(200);
const manuallyCorrectedSession = JSON.parse(await page.evaluate(() => localStorage.getItem('gps-checker-last-session-v1')));
assert.equal(manuallyCorrectedSession.photos[0].manualCoordinates, true);
assert.deepEqual(manuallyCorrectedSession.photos[0].coordinates, { latitude: 62.1, longitude: 34.1 });

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
await page.screenshot({ path: resolve(outputDir, '11-iteration3-results.png'), fullPage: true });

await page.evaluate(() => {
  const session = JSON.parse(localStorage.getItem('gps-checker-last-session-v1'));
  session.photos[1].thumbnailDataUrl = null;
  localStorage.setItem('gps-checker-last-session-v1', JSON.stringify(session));
});
await page.reload({ waitUntil: 'networkidle' });
assert.match(await page.locator('.session-prompt').textContent(), /Найден последний результат/);
await page.getByRole('button', { name: 'Восстановить' }).click();
assert.equal(await page.locator('.photo-result').count(), 2);
assert.equal(await page.locator('.photo-thumbnail').count(), 1);
assert.equal(await page.getByText('Превью недоступно').count(), 1);
assert.equal(await page.getByText('https://free.test/1', { exact: true }).isVisible(), true);
assert.equal(await page.getByText(/Восстановлен сохранённый результат/).isVisible(), true);
assert.equal(await page.getByText('Координаты заданы вручную').first().isVisible(), true);
await page.getByRole('button', { name: 'Показать журнал' }).click();
assert.match(await page.locator('.journal-list').textContent(), /Сессия восстановлена/);
await page.locator('.photo-results').scrollIntoViewIfNeeded();
await page.screenshot({ path: resolve(outputDir, '12-iteration3-session-restored.png'), fullPage: false });

await page.getByRole('button', { name: 'Очистить результат' }).last().click();
assert.equal(await page.locator('.photo-result').count(), 0);
assert.equal(await page.evaluate(() => localStorage.getItem('gps-checker-last-session-v1')), null);
assert.deepEqual(errors, []);

await context.close();
await browser.close();
console.log('Iteration 3 browser check passed');
