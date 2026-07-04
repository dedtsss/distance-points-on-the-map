import { chromium, devices } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { verifyCleanedMetadata } from '../../src/features/cleanup/metadataVerifier.js';

const auditDir = dirname(fileURLToPath(import.meta.url));
await mkdir(auditDir, { recursive: true });

const baseUrl = process.env.AUDIT_URL || 'http://127.0.0.1:4173/distance-points-on-the-map/';
const browser = await chromium.launch({ headless: true });
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];

const injectGpsExif = (jpegBuffer, latitude, longitude) => {
  const toDms = (value) => {
    const degrees = Math.floor(Math.abs(value));
    const minutesFloat = (Math.abs(value) - degrees) * 60;
    const minutes = Math.floor(minutesFloat);
    const secondsNumerator = Math.round((minutesFloat - minutes) * 60 * 1_000_000);
    return [[degrees, 1], [minutes, 1], [secondsNumerator, 1_000_000]];
  };
  const lat = toDms(latitude);
  const lon = toDms(longitude);
  const tiff = Buffer.alloc(128);
  tiff.write('II', 0, 'ascii');
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8);
  tiff.writeUInt16LE(0x8825, 10);
  tiff.writeUInt16LE(4, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt32LE(26, 18);
  tiff.writeUInt32LE(0, 22);

  tiff.writeUInt16LE(4, 26);
  const writeGpsEntry = (index, tag, type, count, value) => {
    const offset = 28 + index * 12;
    tiff.writeUInt16LE(tag, offset);
    tiff.writeUInt16LE(type, offset + 2);
    tiff.writeUInt32LE(count, offset + 4);
    if (typeof value === 'number') tiff.writeUInt32LE(value, offset + 8);
    else tiff.write(value, offset + 8, 'ascii');
  };
  writeGpsEntry(0, 1, 2, 2, latitude >= 0 ? 'N\0' : 'S\0');
  writeGpsEntry(1, 2, 5, 3, 80);
  writeGpsEntry(2, 3, 2, 2, longitude >= 0 ? 'E\0' : 'W\0');
  writeGpsEntry(3, 4, 5, 3, 104);
  tiff.writeUInt32LE(0, 76);
  [...lat, ...lon].forEach(([numerator, denominator], index) => {
    const offset = 80 + index * 8;
    tiff.writeUInt32LE(numerator, offset);
    tiff.writeUInt32LE(denominator, offset + 4);
  });

  const exifPayload = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
  const app1 = Buffer.alloc(exifPayload.length + 4);
  app1[0] = 0xff;
  app1[1] = 0xe1;
  app1.writeUInt16BE(exifPayload.length + 2, 2);
  exifPayload.copy(app1, 4);
  return Buffer.concat([jpegBuffer.subarray(0, 2), app1, jpegBuffer.subarray(2)]);
};

const makeJpeg = async (page, withOverlay = false) => Buffer.from(await page.evaluate(async (overlay) => {
  const canvas = document.createElement('canvas');
  canvas.width = 1000;
  canvas.height = 700;
  const context = canvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, 1000, 700);
  gradient.addColorStop(0, '#dbeafe');
  gradient.addColorStop(1, '#94a3b8');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#264653';
  context.fillRect(0, 420, canvas.width, 280);
  if (overlay) {
    context.fillStyle = '#ffffff';
    context.fillRect(470, 485, 520, 180);
    context.fillStyle = '#000000';
    context.font = 'bold 46px Arial';
    context.fillText('LAT 62.223456', 500, 560);
    context.fillText('LON 34.223456', 500, 625);
  }
  const blob = await new Promise((resolveBlob) => canvas.toBlob(resolveBlob, 'image/jpeg', 0.92));
  return [...new Uint8Array(await blob.arrayBuffer())];
}, withOverlay));

const attachDiagnostics = (page) => {
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`));
};

const multipartValue = (request, fieldName) => {
  const body = request.postDataBuffer()?.toString('latin1') || '';
  return body.match(new RegExp(`name="${fieldName}"\\r\\n\\r\\n([^\\r\\n]+)`))?.[1] || '';
};

const multipartFilename = (request) => {
  const body = request.postDataBuffer()?.toString('latin1') || '';
  return body.match(/filename="([^"]+)"/)?.[1] || '';
};

const mobileContext = await browser.newContext({
  ...devices['Pixel 7'],
  locale: 'ru-RU',
  permissions: ['clipboard-read', 'clipboard-write'],
});
const page = await mobileContext.newPage();
attachDiagnostics(page);
await page.goto(baseUrl, { waitUntil: 'networkidle' });
await page.screenshot({ path: resolve(auditDir, '01-start-mobile.png'), fullPage: true });
assert.equal(await page.locator('h1').textContent(), 'Проверка фотографий по координатам');
assert.equal(await page.locator('.debug-details').count(), 0);
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
await page.keyboard.press('Tab');
assert.equal(await page.evaluate(() => document.activeElement?.matches('input[type=file]')), true);

const plainJpeg = await makeJpeg(page, false);
const ocrJpeg = await makeJpeg(page, true);
const exifJpeg = injectGpsExif(plainJpeg, 62.123456, 34.123456);
await page.locator('input[type=file]').setInputFiles([
  { name: '01-ocr.jpg', mimeType: 'image/jpeg', buffer: ocrJpeg },
  { name: '02-exif.jpg', mimeType: 'image/jpeg', buffer: exifJpeg },
  { name: '03-no-gps.jpg', mimeType: 'image/jpeg', buffer: plainJpeg },
]);
await page.locator('.selected-files li').nth(2).waitFor();
await page.screenshot({ path: resolve(auditDir, '02-selected-mobile.png'), fullPage: true });
assert.equal(await page.locator('.selected-files li').count(), 3);
assert.equal(await page.getByRole('button', { name: 'Проверить и загрузить' }).isEnabled(), true);

await page.getByRole('button', { name: 'Проверить и загрузить' }).click();
await page.locator('.status-reading_gps').waitFor({ timeout: 15_000 });
await page.locator('.progress-card').scrollIntoViewIfNeeded();
await page.screenshot({ path: resolve(auditDir, '03-processing-mobile.png'), fullPage: false });
await page.getByRole('button', { name: 'Обработка завершена' }).waitFor({ timeout: 240_000 });
await page.screenshot({ path: resolve(auditDir, '04-results-mobile.png'), fullPage: true });

const cards = page.locator('.photo-result');
assert.equal(await cards.count(), 3);
const ocrCardText = await cards.nth(0).textContent();
assert.match(ocrCardText, /62\.223456, 34\.223456/);
assert.match(await cards.nth(1).textContent(), /62\.123456, 34\.123456/);
assert.match(await cards.nth(2).textContent(), /нет координат/);
assert.match(await cards.nth(2).textContent(), /не участвует/);
assert.equal(await page.locator('.results-summary tbody tr').count(), 3);
assert.equal(await page.locator('.results-summary tbody tr a').count() >= 6, true);
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);

await page.getByRole('button', { name: 'Скопировать все ссылки' }).click();
const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
assert.equal(clipboardText.split('\n').filter(Boolean).length >= 6, true);

const debugPage = await mobileContext.newPage();
attachDiagnostics(debugPage);
await debugPage.goto(`${baseUrl}?debug=1`, { waitUntil: 'networkidle' });
await debugPage.locator('input[type=file]').setInputFiles([
  { name: 'debug-ocr.jpg', mimeType: 'image/jpeg', buffer: ocrJpeg },
  { name: 'debug-exif.jpg', mimeType: 'image/jpeg', buffer: exifJpeg },
]);
await debugPage.locator('.debug-details').first().waitFor();
assert.equal(await debugPage.getByText('Включён режим диагностики').isVisible(), true);
assert.equal(await debugPage.locator('.debug-details').count(), 2);
await debugPage.getByRole('button', { name: 'Проверить и загрузить' }).click();
await debugPage.getByRole('button', { name: 'Обработка завершена' }).waitFor({ timeout: 180_000 });
const ocrDebug = await debugPage.locator('.debug-details pre').nth(0).textContent();
const exifDebug = await debugPage.locator('.debug-details pre').nth(1).textContent();
assert.match(await debugPage.locator('.photo-result').nth(0).textContent(), /62\.223456, 34\.223456/);
assert.match(await debugPage.locator('.photo-result').nth(1).textContent(), /62\.123456, 34\.123456/);
const parsedOcrDebug = JSON.parse(ocrDebug);
const parsedExifDebug = JSON.parse(exifDebug);
assert.match(parsedOcrDebug.gps?.ocr?.rawText || '', /62[.,]223456/);
const uploadedDirectUrl = parsedExifDebug.providerResponses?.freeimage?.directUrl;
assert.ok(uploadedDirectUrl);
const uploadedResponse = await fetch(uploadedDirectUrl);
assert.equal(uploadedResponse.ok, true);
const uploadedBytes = Buffer.from(await uploadedResponse.arrayBuffer());
const uploadedMetadataVerification = await verifyCleanedMetadata(uploadedBytes);
assert.equal(uploadedMetadataVerification.checked, true);
assert.equal(uploadedMetadataVerification.hasGps, false);
assert.equal(uploadedMetadataVerification.hasExif, false);
await debugPage.screenshot({ path: resolve(auditDir, '05-debug-mobile.png'), fullPage: true });

const fallbackPage = await mobileContext.newPage();
attachDiagnostics(fallbackPage);
await fallbackPage.route('https://spring-mouse-8d81.dvabobra2014.workers.dev/**', async (route) => {
  const photoId = multipartValue(route.request(), 'photoId');
  const fileName = multipartFilename(route.request());
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      target: 'bundle',
      ninjaboxGalleryUrl: 'https://ninjabox.test/gallery',
      items: [{
        index: 0,
        photoId,
        fileName,
        links: [
          { provider: 'ninjabox', role: 'secondary', url: 'https://ninjabox.test/photo' },
          { provider: 'x0', role: 'fallback', url: 'https://x0.test/photo', replaces: ['freeimage'] },
        ],
        providers: {
          freeimage: { ok: false, error: 'simulated outage' },
          ninjabox: { ok: true, url: 'https://ninjabox.test/photo' },
          x0: { ok: true, url: 'https://x0.test/photo' },
        },
      }],
    }),
  });
});
await fallbackPage.goto(baseUrl, { waitUntil: 'networkidle' });
await fallbackPage.locator('input[type=file]').setInputFiles({ name: 'fallback.jpg', mimeType: 'image/jpeg', buffer: plainJpeg });
await fallbackPage.getByRole('button', { name: 'Проверить и загрузить' }).click();
await fallbackPage.getByRole('button', { name: 'Обработка завершена' }).waitFor({ timeout: 180_000 });
const fallbackCardText = await fallbackPage.locator('.photo-result').textContent();
assert.match(fallbackCardText, /Freeimage: заменён на x0\.at/);
assert.match(fallbackCardText, /Ninjabox: загружено/);
assert.match(fallbackCardText, /использован x0\.at/);
await fallbackPage.screenshot({ path: resolve(auditDir, '07-fallback-mobile.png'), fullPage: true });

let isolatedUploadRequests = 0;
const isolationPage = await mobileContext.newPage();
attachDiagnostics(isolationPage);
await isolationPage.route('https://spring-mouse-8d81.dvabobra2014.workers.dev/**', async (route) => {
  isolatedUploadRequests += 1;
  const photoId = multipartValue(route.request(), 'photoId');
  const fileName = multipartFilename(route.request());
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      target: 'bundle',
      ninjaboxGalleryUrl: 'https://ninjabox.test/gallery',
      items: [{
        index: 0,
        photoId,
        fileName,
        links: [
          { provider: 'freeimage', role: 'primary', url: 'https://freeimage.test/photo' },
          { provider: 'ninjabox', role: 'secondary', url: 'https://ninjabox.test/photo' },
        ],
        providers: { freeimage: { ok: true }, ninjabox: { ok: true }, x0: null },
      }],
    }),
  });
});
await isolationPage.goto(baseUrl, { waitUntil: 'networkidle' });
await isolationPage.locator('input[type=file]').setInputFiles([
  { name: 'broken.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not a jpeg') },
  { name: 'valid.jpg', mimeType: 'image/jpeg', buffer: plainJpeg },
]);
await isolationPage.getByRole('button', { name: 'Проверить и загрузить' }).click();
await isolationPage.getByRole('button', { name: 'Обработка завершена' }).waitFor({ timeout: 180_000 });
assert.match(await isolationPage.locator('.photo-result').nth(0).textContent(), /Не удалось очистить metadata\. Фото не загружено\./);
assert.match(await isolationPage.locator('.photo-result').nth(1).textContent(), /Загружено: две ссылки/);
assert.equal(isolatedUploadRequests, 1);
await isolationPage.screenshot({ path: resolve(auditDir, '08-cleanup-isolation-mobile.png'), fullPage: true });

const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ru-RU' });
const desktopPage = await desktopContext.newPage();
attachDiagnostics(desktopPage);
await desktopPage.goto(baseUrl, { waitUntil: 'networkidle' });
await desktopPage.screenshot({ path: resolve(auditDir, '06-start-desktop.png'), fullPage: true });
assert.equal(await desktopPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);

await desktopContext.close();
await mobileContext.close();
await browser.close();

console.log(JSON.stringify({
  ok: true,
  consoleErrors,
  pageErrors,
  failedRequests,
  ocrCardText,
  ocrRawText: parsedOcrDebug.gps?.ocr?.rawText || '',
  uploadedMetadataVerification,
  screenshots: [
    '01-start-mobile.png',
    '02-selected-mobile.png',
    '03-processing-mobile.png',
    '04-results-mobile.png',
    '05-debug-mobile.png',
    '06-start-desktop.png',
    '07-fallback-mobile.png',
    '08-cleanup-isolation-mobile.png',
  ],
}, null, 2));
