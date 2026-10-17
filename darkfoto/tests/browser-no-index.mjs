import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { noIndex18 } from './fixtures/no-index-18.mjs';
import { syntheticGpsJpeg } from './fixtures/synthetic-exif.mjs';

const server = await createServer({ configFile: new URL('../vite.config.js', import.meta.url).pathname,
  root: new URL('..', import.meta.url).pathname, logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(30000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
// Keep production EXIF parsing, readPhoto, grouping, OCR, UI and MapLibre.
// Observe OCR invocations; only the external basemap is replaced.
await page.route('**/src/core/features/gps/ocrReader.js', async (route) => {
  const response = await route.fetch();
  const body = (await response.text()).replace('export async function readCoordinatesWithOcr(', 'async function originalOcr(');
  await route.fulfill({ response, body: body + `
export async function readCoordinatesWithOcr(file, options) {
  globalThis.__ocrCalls ||= []; globalThis.__ocrCalls.push(file.name);
  return originalOcr(file, options);
}` });
});
await page.route('https://tiles.openfreemap.org/styles/liberty', (route) => route.fulfill({ contentType: 'application/json',
  body: JSON.stringify({ version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#f2efe9' } }] }) }));
const setting = () => page.getByRole('checkbox', { name: 'Учитывать номер/индекс на фото' });
const cards = () => page.locator('.result-photo-card');
const first = () => cards().first();
const tabs = () => page.locator('ion-segment-button');
const reset = async () => {
  await page.getByRole('button', { name: 'Начать заново', exact: true }).click();
  await page.locator('.reset-work-alert').getByRole('button', { name: 'Очистить', exact: true }).click();
  await page.locator('.reset-work-alert').waitFor({ state: 'hidden' });
  assert.equal(await setting().isChecked(), false);
};
try {
  await page.goto(server.resolvedUrls.local[0]);
  assert.equal(await setting().isChecked(), false, 'fresh browser default OFF');
  const jpeg = Buffer.from(await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 360;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#344d67'; ctx.fillRect(0, 0, 480, 360);
    ctx.fillStyle = '#fff'; ctx.font = '28px Arial'; ctx.fillText('SYNTHETIC / ISSUE 607', 30, 170);
    return Array.from(new Uint8Array(await (await new Promise((r) => canvas.toBlob(r, 'image/jpeg'))).arrayBuffer()));
  }));
  const photos = noIndex18.map((p, i) => i === 1 ? { ...p, coordinates: { ...p.coordinates, latitude: p.coordinates.latitude + .00001 } } : p);
  await page.locator('input[type=file]').first().setInputFiles(photos.map((p) => ({ name: p.fileName,
    mimeType: 'image/jpeg', buffer: syntheticGpsJpeg(jpeg, p) })));
  await page.getByRole('button', { name: 'Обработать фото', exact: true }).click();
  await page.getByRole('heading', { name: 'Проверка точек' }).waitFor();
  assert.equal(await page.locator('.point-count').textContent(), '18 фото → 9 точек');
  assert.equal(await cards().count(), 9);
  assert.equal(await setting().isDisabled(), true, 'workflow mode locked after recognition');
  assert.deepEqual(await page.evaluate(() => globalThis.__ocrCalls || []), [], '18 valid EXIF JPEGs skip real web OCR entirely');
  assert.equal(await page.locator('.point-section-main .result-photo-card').count(), 8);
  assert.equal(await page.locator('.point-section-reserve .result-photo-card').count(), 1);
  assert.equal(await page.locator('.review-reason').count(), 0);
  assert.equal(await page.locator('.member-evidence').count(), 18);
  assert.equal(await first().locator('.photo-filenames').count(), 0);
  for (const [i, evidence] of (await first().locator('.member-evidence').all()).entries()) {
    assert.match(await evidence.textContent(), new RegExp(photos[i].fileName.replaceAll('.', '\\.')));
    assert.match(await evidence.textContent(), /64\.1234\d+, 30\.54321.*EXIF/);
    assert.doesNotMatch(await evidence.textContent(), /Индекс|не распознан/);
  }
  const before = await page.locator('.reserve-reasons').textContent();
  await first().locator('[data-member-id="2"] .make-representative').click();
  assert.equal(await first().locator('[data-member-id="2"] .representative-label').textContent(), 'Главная');
  assert.match(await first().locator('.photo-coordinates').textContent(), /64\.12346/);
  assert.notEqual(await page.locator('.reserve-reasons').textContent(), before, 'conflict distance recomputed from selected photo');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Экспорт', exact: true }).click();
  const gpx = await readFile(await (await download).path(), 'utf8');
  assert.equal((gpx.match(/<wpt /g) || []).length, 9);
  assert.match(gpx, /lat="64\.12346"/);
  assert.match(gpx, /<name>Точка 1<\/name>/);
  await page.evaluate(() => {
    globalThis.__txtPresented = false; globalThis.__txtDismissed = false;
    const modal = document.querySelector('.txt-modal');
    modal.addEventListener('ionModalDidPresent', () => { globalThis.__txtPresented = true; }, { once: true });
    modal.addEventListener('ionModalDidDismiss', () => { globalThis.__txtDismissed = true; }, { once: true });
  });
  await page.getByRole('button', { name: 'Посмотреть', exact: true }).click();
  await page.waitForFunction(() => globalThis.__txtPresented);
  await page.locator('.txt-preview').waitFor();
  const txt = await page.locator('.txt-preview').textContent();
  assert.match(txt, /Точка 1\nКоординаты: 64\.12346/);
  assert.doesNotMatch(txt, /Индекс не найден|не распознан|index_missing|index_low_confidence/);
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.waitForFunction(() => globalThis.__txtDismissed);
  for (const [width, height] of [[320, 812], [375, 812], [812, 320], [812, 375]]) {
    await page.setViewportSize({ width, height });
    await first().locator('header').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const fitting = await first().locator('.member-evidence, .make-representative').evaluateAll((elements) => elements.every((el) => {
      const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && el.scrollWidth <= el.clientWidth + 1;
    }));
    assert.equal(fitting, true, `thumbnail evidence/actions fit ${width}x${height}`);
    await mkdir('output/playwright', { recursive: true });
    await page.screenshot({ path: `output/playwright/607-points-${width}-${height}.png` });
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await first().getByRole('button', { name: 'На карте', exact: true }).click();
  await page.locator('.map-loading').waitFor({ state: 'hidden', timeout: 20000 });
  await page.locator('.session-map-marker').first().waitFor();
  assert.equal(await page.locator('.session-map-marker').count(), 9);
  assert.equal(await page.locator('.session-map-marker-reserve').count(), 1);
  assert.match(await page.locator('.map-preview').textContent(), /64\.12346/);
  await page.screenshot({ path: 'output/playwright/607-map-375.png' });
  await tabs().first().click();
  await first().locator('[data-member-id="2"]').getByRole('button', { name: /Действия фото/ }).click();
  await page.locator('.photo-action-sheet').getByRole('button', { name: 'Убрать фото', exact: true }).click();
  await page.locator('.photo-action-sheet').waitFor({ state: 'hidden' });
  assert.equal(await first().locator('[data-member-id="1"] .representative-label').textContent(), 'Главная');
  await first().getByRole('button', { name: /Вернуть фото точки/ }).click();
  assert.equal(await first().locator('.photo-thumbnail').count(), 3);
  assert.equal(await first().locator('[data-member-id="1"] .representative-label').textContent(), 'Главная');
  await reset();
  await setting().check();
  await page.reload();
  assert.equal(await setting().isChecked(), false, 'reload never restores an old mode/job');
  assert.equal(await cards().count(), 0);
  // Real Tesseract fallback, with no EXIF: both decimal conventions + altitude.
  for (const comma of [true, false]) {
    const result = await page.evaluate(async (comma) => {
      const { readPhoto } = await import('/src/core/readPhoto.js');
      const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 960;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#7a899a'; ctx.fillRect(0, 0, 1280, 960);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 42px Arial';
      ctx.fillText('1 r. SYNTHETIC', 50, 845);
      ctx.fillText(comma ? '64,12345 30,54321 225,0m' : '64.12345 30.54321 225.0m', 50, 905);
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', .95));
      return readPhoto(new File([blob], `synthetic-altitude-${comma}.jpg`, { type: 'image/jpeg' }), { indexMode: false });
    }, comma);
    assert.equal(result.gpsSource, 'ocr', JSON.stringify(result));
    assert.equal(result.coordinateQuality, 'confident', JSON.stringify(result));
    assert.ok(Math.abs(result.coordinates.latitude - 64.12345) < .00001);
    assert.ok(Math.abs(result.coordinates.longitude - 30.54321) < .00001);
    assert.equal(result.indexFromOcr, null);
    assert.equal(result.accuracyMeters, null);
    assert.doesNotMatch(result.warnings.join(' '), /index_/);
  }
  assert.deepEqual(errors, []);
  console.log('Issue607: real synthetic EXIF18→9, OCR skipped/OCR comma+dot+altitude fallback, normal Main8/Reserve1/map9, representative/header/conflict/TXT/GPX/fallback, per-thumbnail evidence, 320/375 portrait+landscape, fresh/reset/reload OFF: PASS');
} finally {
  await browser.close(); await server.close();
}
