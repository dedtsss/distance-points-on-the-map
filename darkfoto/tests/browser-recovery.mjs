import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { syntheticGpsJpeg } from './fixtures/synthetic-exif.mjs';

const server = await createServer({ configFile: new URL('../vite.config.js', import.meta.url).pathname,
  root: new URL('..', import.meta.url).pathname, logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
// Only the native plugin boundary is replaced. Production save/load/validation,
// private-photo fetching, grouping, EXIF, recovery writer and React UI run intact.
await page.addInitScript(() => {
  globalThis.__bridge = {
    async pickPhotos() { return { files: JSON.parse(localStorage.getItem('fixture.files')) }; },
    async readPhoto({ id }) {
      const data = JSON.parse(localStorage.getItem('fixture.sources'))[id];
      if (localStorage.getItem('fixture.failRead')) throw Error('Missing private photo');
      return { uri: `file://${id}`, size: atob(data).length };
    },
    async saveRecovery({ payload, ids }) {
      globalThis.__saves = (globalThis.__saves || 0) + 1;
      if (localStorage.getItem('fixture.failSave')) throw Error('Storage unavailable');
      const sources = JSON.parse(localStorage.getItem('fixture.sources') || '{}');
      for (const id of ids || []) if (!sources[id]) throw Error('Missing source');
      localStorage.setItem('fixture.manifest', payload);
      localStorage.setItem('fixture.privateIds', JSON.stringify(ids));
    },
    async loadRecovery() { return { payload: localStorage.getItem('fixture.manifest') || '' }; },
    async restoreRecoveryPhotos({ ids }) {
      globalThis.__restoredIds = ids;
      const copies = JSON.parse(localStorage.getItem('fixture.privateIds') || '[]');
      if (ids.some((id) => !copies.includes(id))) throw Error('Missing private copies');
    },
    async clearRecovery() { if (localStorage.getItem('fixture.failClear')) throw Error('Clear unavailable'); localStorage.removeItem('fixture.manifest'); localStorage.removeItem('fixture.privateIds'); },
  };
});
await page.route('**/src/androidFolder.js', async (route) => {
  const response = await route.fetch();
  const body = (await response.text()).replace(/^import .*? from .*?;\n/, `
const Capacitor = { getPlatform: () => 'android', convertFileSrc: (uri) =>
  'data:image/jpeg;base64,' + JSON.parse(localStorage.getItem('fixture.sources'))[uri.slice(7)] };
const registerPlugin = () => globalThis.__bridge;
`);
  await route.fulfill({ response, body });
});
for (const [path, fn, counter] of [['core/readPhoto.js', 'readPhoto', '__recognitions'], ['core/photoPoints.js', 'groupPhotos', '__groups']]) {
  await page.route(`**/src/${path}`, async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(new RegExp(`(export (?:async )?function ${fn}\\([^]*?\\) \\{)`), `$1\nglobalThis.${counter} = (globalThis.${counter} || 0) + 1;`);
    await route.fulfill({ response, body });
  });
}
await page.route('https://tiles.openfreemap.org/styles/liberty', (route) => route.fulfill({ contentType: 'application/json',
  body: JSON.stringify({ version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#f2efe9' } }] }) }));
const input = (name) => page.getByRole('combobox', { name, exact: true });
const card = (id) => page.locator(`.result-photo-card[data-point-id="${id}"]`);
const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('fixture.manifest')));
const persisted = async (predicate) => {
  await page.waitForFunction(predicate); return saved();
};
const action = async (id, text) => {
  await card(id).getByRole('button', { name: /Действия точки/ }).click();
  await page.locator('.point-action-sheet').getByRole('button', { name: text, exact: true }).click();
  await page.locator('.point-action-sheet').waitFor({ state: 'hidden' });
};
const reset = async () => {
  await page.getByRole('button', { name: 'Начать заново', exact: true }).click();
  const alert = page.locator('.reset-work-alert');
  if (await alert.isVisible()) {
    await alert.getByRole('button', { name: 'Очистить', exact: true }).click();
    await alert.waitFor({ state: 'hidden' });
  }
  await page.waitForFunction(() => !localStorage.getItem('fixture.manifest'));
};
try {
  await page.goto(server.resolvedUrls.local[0]);
  const jpeg = Buffer.from(await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 480; c.height = 360;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#344d67'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = 'white'; ctx.font = '24px Arial'; ctx.fillText('SYNTHETIC / ISSUE 608', 30, 180);
    return [...new Uint8Array(await (await new Promise((r) => c.toBlob(r, 'image/jpeg'))).arrayBuffer())];
  }));
  const meters = [0, 10, 0, 100, 124, 0]; // A1,B1,A2 ... A3; two tolerant points.
  const fixtures = meters.map((m, i) => ({ id: `native-${i + 1}`, name: `synthetic-${i + 1}.jpg`, type: 'image/jpeg', native: true,
    data: syntheticGpsJpeg(jpeg, { coordinates: { latitude: 64 + m * 180 / (Math.PI * 6371000), longitude: 30 },
      captureTimeMs: Date.UTC(2026, 0, 1) + i * 86_400_000 }).toString('base64') }));
  await page.evaluate((fixtures) => {
    localStorage.setItem('fixture.sources', JSON.stringify(Object.fromEntries(fixtures.map((f) => [f.id, f.data]))));
    localStorage.setItem('fixture.files', JSON.stringify(fixtures.map(({ data, ...file }) => file)));
  }, fixtures);
  await page.getByRole('button', { name: 'Выбрать фото', exact: true }).click();
  await input('Сессия').fill('Синтетическая сессия'); await input('Цвет').fill('Синий');
  await input('Фасовка').fill('1'); await input('Комментарий').fill('Проверка восстановления');
  await page.getByRole('heading', { name: 'Фотографии', exact: true }).click();
  await persisted(() => JSON.parse(localStorage.getItem('fixture.manifest') || 'null')?.phase === 'selected');
  await page.reload();
  await page.getByText('Работа восстановлена.', { exact: true }).waitFor();
  assert.equal(await input('Сессия').inputValue(), 'Синтетическая сессия');
  assert.deepEqual(await page.evaluate(() => [globalThis.__recognitions || 0, globalThis.__groups || 0]), [0, 0]);
  await page.getByRole('button', { name: 'Обработать фото', exact: true }).click();
  await page.getByRole('heading', { name: 'Проверка точек' }).waitFor();
  assert.equal(await page.locator('.point-count').textContent(), '6 фото → 4 точек');
  assert.deepEqual(await page.evaluate(() => [globalThis.__recognitions, globalThis.__groups]), [6, 1]);
  assert.equal(await page.locator('.tolerance-warning').count(), 2);
  assert.match(await card('4').locator('.tolerance-warning').textContent(), /Допуск: 24\.0 м до Точка 5/);
  const a = 'point:1:3:6';
  await action('2', 'В основные');
  assert.match(await card(a).locator('.photo-state').textContent(), /Резерв/);
  await action(a, 'В основные');
  assert.equal(await page.locator('.photo-detail [role=alert]').count(), 2);
  await mkdir('output/playwright', { recursive: true });
  await card(a).evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: 'output/playwright/608-manual-conflict.png' });
  await action('2', 'В резерв');
  assert.match(await card('2').locator('.photo-state').textContent(), /Резерв/);
  await action('2', 'Авто');
  assert.match(await card('2').locator('.photo-state').textContent(), /Резерв/, 'Auto yields to forced Main');
  await card(a).locator('[data-member-id="3"] .make-representative').click();
  await card(a).locator('[data-member-id="1"]').getByRole('button', { name: /Действия фото/ }).click();
  await page.locator('.photo-action-sheet').getByRole('button', { name: 'Убрать фото', exact: true }).click();
  await page.locator('.photo-action-sheet').waitFor({ state: 'hidden' });
  const before = await persisted(() => JSON.parse(localStorage.getItem('fixture.manifest') || 'null')?.rows?.[0]?.excludedMembers?.length === 1);
  await page.reload(); await page.getByText('Работа восстановлена.', { exact: true }).waitFor();
  assert.deepEqual((await saved()).rows, before.rows, 'saved edited logical rows returned exactly');
  assert.equal(await card(a).locator('[data-member-id="3"] .representative-label').textContent(), 'Главная');
  assert.equal(await card(a).locator('.photo-thumbnail').count(), 2);
  assert.equal(await page.locator('.tolerance-warning').count(), 2);
  assert.deepEqual(await page.evaluate(() => [globalThis.__recognitions || 0, globalThis.__groups || 0]), [0, 0]);
  await page.waitForFunction(() => globalThis.__saves >= 1);
  // A failed write stays visible and cannot replace the last good snapshot.
  const lastGood = await saved();
  await page.evaluate(() => localStorage.setItem('fixture.failSave', '1'));
  await input('Комментарий').fill('Изменение при ошибке');
  await page.getByRole('alert').filter({ hasText: 'Не удалось сохранить работу.' }).waitFor();
  assert.deepEqual(await saved(), lastGood);
  await page.evaluate(() => localStorage.removeItem('fixture.failSave'));
  await input('Комментарий').fill('Проверка восстановления');
  await persisted(() => JSON.parse(localStorage.getItem('fixture.manifest')).comment === 'Проверка восстановления');
  await page.getByRole('alert').filter({ hasText: 'Не удалось сохранить работу.' }).waitFor({ state: 'hidden' });
  // Restore publication/stale state, index mode and the top-level map screen.
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('fixture.manifest'));
    state.phase = 'processed'; state.publisher = 'onion'; state.onion = 'http://synthetic.onion'; state.resumeAvailable = true;
    state.indexMode = true; state.screen = 'map';
    state.rows[0].uploadResult = { stale: true, staleLinks: [{ provider: 'onion', url: 'https://example.com/old' }], links: [] };
    state.rows[1].uploadResult = { links: [{ provider: 'onion', url: 'https://example.com/current' }] };
    localStorage.setItem('fixture.manifest', JSON.stringify(state));
  });
  const published = await saved();
  await page.reload();
  await page.locator('ion-segment-button.segment-button-checked').filter({ hasText: 'Карта' }).waitFor();
  await page.locator('ion-segment-button').first().click();
  await page.getByRole('heading', { name: 'Результат', exact: true }).waitFor();
  assert.equal(await page.getByRole('checkbox').isChecked(), true);
  await page.getByRole('button', { name: 'Продолжить публикацию', exact: true }).waitFor();
  assert.match(await card(a).textContent(), /требуется повторная публикация/);
  assert.equal(await card('2').getByRole('link', { name: 'Открыть', exact: true }).getAttribute('href'), 'https://example.com/current');
  assert.deepEqual((await saved()).rows, published.rows);
  assert.deepEqual(await page.evaluate(() => [globalThis.__recognitions || 0, globalThis.__groups || 0]), [0, 0]);
  await mkdir('output/playwright', { recursive: true });
  for (const [width, height] of [[320, 812], [375, 812], [812, 320], [812, 375]]) {
    await page.setViewportSize({ width, height });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await card(a).evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: `output/playwright/608-recovery-${width}-${height}.png` });
  }
  // The picker and its captures use only the canvas-generated source JPEGs.
  await card(a).locator('[data-member-id="6"]').getByRole('button', { name: /Действия фото/ }).click();
  await page.locator('.photo-action-sheet').getByRole('button', { name: 'Переместить', exact: true }).click();
  await page.locator('.photo-action-sheet').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => !document.getAnimations().some((animation) => animation.playState === 'running'));
  for (const [width, height] of [[320, 812], [375, 812], [812, 320], [812, 375]]) {
    await page.setViewportSize({ width, height });
    await page.locator('.destination-source img').waitFor();
    await page.locator('[data-destination-id="4"] img').waitFor();
    const box = await page.locator('.move-photo-modal ion-content').boundingBox();
    assert.ok(box.height >= 80 && box.x >= 0 && box.x + box.width <= width + 1);
    if (height < 450) {
      assert.equal(await page.locator('[data-destination-id="4"] ion-label').evaluate((el) => getComputedStyle(el).display), 'grid');
    }
    assert.equal(await page.locator('.move-photo-modal ion-content').evaluate((el) => el.scrollWidth <= el.clientWidth), true);
    await page.screenshot({ path: `output/playwright/608-synthetic-picker-${width}-${height}.png` });
  }
  await page.locator('[data-destination-id="4"]').click();
  await page.locator('.move-photo-modal').waitFor({ state: 'hidden' });
  await action('5', 'Объединить с…');
  await page.locator('.destination-source img').waitFor();
  await page.locator(`[data-destination-id="${a}"] img`).waitFor();
  await page.locator(`[data-destination-id="${a}"]`).click();
  await page.locator('.move-photo-modal').waitFor({ state: 'hidden' });
  const edited = await persisted(() => JSON.parse(localStorage.getItem('fixture.manifest')).rows.length === 3);
  await page.reload(); await page.getByText('Работа восстановлена.', { exact: true }).waitFor();
  assert.deepEqual((await saved()).rows, edited.rows, 'visual move/merge restore exact logical membership');
  assert.deepEqual(await page.evaluate(() => [globalThis.__recognitions || 0, globalThis.__groups || 0]), [0, 0]);
  await page.evaluate(() => localStorage.setItem('fixture.failClear', '1'));
  await page.getByRole('button', { name: 'Начать заново', exact: true }).click();
  await page.locator('.reset-work-alert').getByRole('button', { name: 'Очистить', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Не удалось очистить сохранённую работу.' }).waitFor();
  await page.locator('.reset-work-alert').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.result-photo-card').count(), 3);
  assert.ok(await saved());
  await page.evaluate(() => localStorage.removeItem('fixture.failClear'));
  await reset();
  assert.equal(await page.locator('.result-photo-card').count(), 0);
  assert.equal(await input('Сессия').inputValue(), '');
  assert.equal(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('fixture.sources'))).length), 6, 'source originals survive reset');
  await page.reload(); await page.getByText('Выбрано: 0', { exact: true }).waitFor();
  await input('Сессия').focus();
  assert.match(await page.getByRole('listbox', { name: 'Подсказки: Сессия', exact: true }).textContent(), /Синтетическая сессия/);
  // Damaged manifests and unreadable private copies fail closed until explicit reset.
  for (const failure of ['manifest', 'photo']) {
    await page.evaluate(({ before, failure }) => {
      localStorage.setItem('fixture.manifest', failure === 'manifest' ? '{broken' : JSON.stringify(before));
      localStorage.setItem('fixture.privateIds', JSON.stringify(before.files.map((f) => f.id)));
      if (failure === 'photo') localStorage.setItem('fixture.failRead', '1');
    }, { before, failure });
    await page.reload(); await page.getByRole('alert').filter({ hasText: 'Не удалось восстановить работу' }).waitFor();
    assert.equal(await page.locator('.result-photo-card').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Обработать фото', exact: true }).isDisabled(), true);
    assert.deepEqual(await page.evaluate(() => [globalThis.__recognitions || 0, globalThis.__groups || 0]), [0, 0]);
    assert.ok(await page.evaluate(() => localStorage.getItem('fixture.manifest')), 'failed recovery retained');
    await reset(); await page.evaluate(() => localStorage.removeItem('fixture.failRead'));
  }
  assert.deepEqual(errors, []);
  console.log('Issue608 native-bridge browser: selection/job exact recovery without OCR/regroup; manual statuses/conflict; representative/exclusion; fields/index/publication/stale/map; tolerance; reset/MRU/source preservation; save/reset failures and corrupt/missing recovery fail closed; 320/375 portrait+landscape: PASS');
} finally {
  await browser.close(); server.httpServer.closeAllConnections(); await server.close();
}
