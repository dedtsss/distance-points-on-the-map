import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ configFile: new URL('../vite.config.js', import.meta.url).pathname,
  root: new URL('..', import.meta.url).pathname, logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
// Exercise the Android export UI with a recording bridge. The production
// DocumentsContract writer has separate native transaction/failure coverage.
await page.route('**/src/androidSessionExport.js', (route) => route.fulfill({ contentType: 'application/javascript', body: `
export const hasSessionFolderExport = () => true;
export const androidSessionDestination = {
  begin: async (plan) => { globalThis.__export = { plan, files: [], committed: false }; return { token: 'test' }; },
  stage: async (file) => { if (globalThis.__failExport) throw new Error('Нет места'); globalThis.__export.files.push(file); },
  commit: async () => { globalThis.__export.committed = true; return { directory: globalThis.__export.plan.sessionName, files: globalThis.__export.files.length }; },
  abort: async () => { globalThis.__export.aborted = true; },
};
` }));
await page.route('**/src/core/readPhoto.js', (route) => route.fulfill({ contentType: 'application/javascript', body: `
export async function readPhoto(file) {
  const n = Number(file.name.match(/source-(\\d+)/)[1]);
  return { coordinates: { latitude: 64, longitude: n <= 9 ? 30 : 30.01 },
    coordinateQuality: 'confident', gpsSource: 'exif', gpsStatus: 'done',
    indexFromOcr: String(6950 + n), indexStatus: 'found', orientation: 1, accuracyMeters: n,
    captureTimeMs: 1700000000000 + n * 1000, captureTimeSource: 'exif' };
}` }));
try {
  await page.goto(server.resolvedUrls.local[0]);
  const buffer = await readFile(new URL('fixtures/representative-6300.jpg', import.meta.url));
  await page.locator('input[type=file]').first().setInputFiles(Array.from({ length: 10 }, (_, i) => ({
    name: `source-${String(i + 1).padStart(2, '0')}.jpg`, mimeType: 'image/jpeg', buffer,
  })));
  await page.getByRole('button', { name: 'Обработать фото', exact: true }).click();
  await page.getByRole('heading', { name: 'Проверка точек' }).waitFor();
  const point = page.locator('.result-photo-card').first();
  assert.equal(await point.locator('.photo-thumbnail').count(), 9);
  await mkdir('/tmp/darkcat-stage-a', { recursive: true });
  for (const width of [320, 375, 812]) {
    await page.setViewportSize({ width, height: width === 812 ? 375 : 812 });
    await point.scrollIntoViewIfNeeded();
    const bounds = await point.locator('.photo-thumbnail').evaluateAll((elements) => elements.map((el) => {
      const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width };
    }));
    assert.equal(new Set(bounds.map((r) => r.x)).size, 3);
    assert.equal(new Set(bounds.map((r) => r.y)).size, 3);
    assert.ok(bounds.every((r) => r.width >= (width === 320 ? 69 : 87)));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: `/tmp/darkcat-stage-a/grid-${width}.png` });
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await point.locator('.photo-thumbnail').nth(4).click();
  await page.locator('.image-gesture-area img').waitFor();
  const swipe = async (dx) => {
    const r = await page.locator('.image-gesture-area').boundingBox();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x + dx, y, { steps: 6 }); await page.mouse.up();
  };
  const title = page.locator('.image-viewer-modal ion-title');
  assert.equal(await title.textContent(), 'Фотография 5/9');
  await swipe(100); await page.waitForFunction(() => document.querySelector('.image-viewer-modal ion-title').textContent === 'Фотография 4/9');
  await swipe(-100); await swipe(-100);
  assert.equal(await title.textContent(), 'Фотография 6/9');
  for (let i = 0; i < 6; i++) await swipe(-100);
  assert.equal(await title.textContent(), 'Фотография 9/9');
  for (let i = 0; i < 11; i++) await swipe(100);
  assert.equal(await title.textContent(), 'Фотография 1/9');
  await page.getByRole('button', { name: 'Увеличить' }).click();
  await swipe(-100);
  assert.equal(await title.textContent(), 'Фотография 1/9', 'zoomed gestures pan rather than change photo');
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  for (const member of ['1', '2', '3']) {
    await point.locator(`[data-member-id="${member}"]`).getByRole('button', { name: /Действия фото/ }).click();
    await page.locator('.photo-action-sheet').getByRole('button', { name: 'Убрать фото', exact: true }).click();
    await page.locator('.photo-action-sheet').waitFor({ state: 'hidden' });
  }
  assert.equal(await point.locator('.photo-thumbnail').count(), 6);
  await page.getByRole('button', { name: 'Экспортировать сессию', exact: true }).click();
  await page.getByText(/Сессия экспортирована:/).waitFor();
  const exported = await page.evaluate(async () => {
    const { verifyCleanedMetadata, isMetadataVerificationSafe } = await import('/src/core/features/cleanup/metadataVerifier.js');
    const saved = globalThis.__export;
    for (const file of saved.files.filter((file) => file.mime === 'image/jpeg')) {
      const bytes = Uint8Array.from(atob(file.data), (c) => c.charCodeAt(0));
      const result = await verifyCleanedMetadata(new File([bytes], file.path, { type: 'image/jpeg' }));
      if (!isMetadataVerificationSafe(result)) throw new Error('Export metadata remains');
    }
    return { paths: saved.files.map((file) => file.path), text: saved.files.filter((file) => file.mime === 'text/plain')
      .map((file) => new TextDecoder().decode(Uint8Array.from(atob(file.data), (c) => c.charCodeAt(0)))), committed: saved.committed };
  });
  assert.equal(exported.committed, true);
  assert.deepEqual(exported.paths.slice(0, 7), [...Array.from({ length: 6 }, (_, i) => `6954/6954-${String(i + 1).padStart(2, '0')}.jpg`), '6954/6954.txt']);
  assert.equal(exported.paths.length, 9);
  assert.match(exported.text[0], /Фото: 6/); assert.doesNotMatch(exported.text.join('\n'), /https?:\/\//);
  await page.evaluate(() => { globalThis.__failExport = true; });
  await page.getByRole('button', { name: 'Экспортировать сессию', exact: true }).click();
  await page.getByText('Экспорт сессии: Нет места', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => globalThis.__export.committed), false);
  assert.equal(await page.evaluate(() => globalThis.__export.aborted), true);
  await page.evaluate(() => { globalThis.__failExport = false; });
  for (const member of ['3', '2', '1']) {
    await point.getByRole('button', { name: /Вернуть фото точки/ }).click();
    assert.equal(await point.locator(`[data-member-id="${member}"]`).count(), 1);
    assert.equal(await point.locator('.photo-identity').textContent(), `#695${member}`);
  }
  assert.equal(await point.locator('.photo-thumbnail').count(), 9);
  assert.equal(await point.getByRole('button', { name: /Вернуть фото точки/ }).count(), 0);
  for (const label of ['Сессия', 'Цвет', 'Фасовка', 'Комментарий']) {
    const input = page.getByRole('combobox', { name: label, exact: true });
    for (let i = 1; i <= 12; i++) {
      await input.fill(`${label} ${i}`);
      await page.getByRole('heading', { name: 'Фотографии', exact: true }).click();
    }
  }
  await page.reload();
  for (const label of ['Сессия', 'Цвет', 'Фасовка', 'Комментарий']) {
    const input = page.getByRole('combobox', { name: label, exact: true });
    await input.focus();
    const list = page.getByRole('listbox', { name: `Подсказки: ${label}`, exact: true });
    assert.equal(await list.getByRole('option').count(), 10);
    assert.deepEqual((await list.getByRole('option').allTextContents()).slice(0, 2), [`${label} 12`, `${label} 11`]);
    await input.fill('1');
    assert.deepEqual(await list.getByRole('option').allTextContents(), [`${label} 12`, `${label} 11`, `${label} 10`]);
    await input.press('ArrowDown'); await input.press('Enter');
    assert.equal(await input.inputValue(), `${label} 12`);
    await input.fill(`${label} изменён`);
    await page.getByRole('heading', { name: 'Фотографии', exact: true }).click();
  }
  await page.reload();
  await page.getByRole('combobox', { name: 'Сессия', exact: true }).focus();
  assert.equal(await page.getByRole('listbox', { name: 'Подсказки: Сессия', exact: true }).getByRole('option').first().textContent(), 'Сессия изменён');
  assert.deepEqual(errors, []);
  console.log('Stage A: usable 3×3 at 320/375/812, 5/9 swipe 4↔5↔6, scoped boundaries, zoom pan, three local LIFO restores: PASS');
} finally {
  await browser.close(); server.httpServer.closeAllConnections(); await server.close();
}
