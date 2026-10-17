import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { makePoint } from '../src/core/photoPoints.js';
import { establishReviewSlots } from '../src/pointState.js';
import { splitBatch } from '../src/core/batch.js';
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
const settings = () => page.locator('.settings-modal');
const openSettings = async () => {
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await settings().getByLabel('Радиус одной точки, м', { exact: true }).waitFor();
};
const saveSettings = async () => {
  await settings().getByRole('button', { name: 'Сохранить', exact: true }).click();
  await settings().waitFor({ state: 'hidden' });
};
const counters = () => page.evaluate(() => [globalThis.__recognitions || 0, globalThis.__groups || 0]);
try {
  await page.goto(server.resolvedUrls.local[0]);
  await openSettings();
  assert.equal(await settings().getByRole('button', { name: 'Перегруппировать текущую сессию' }).isDisabled(), true);
  assert.equal(await settings().locator('#point-radius').inputValue(), '4');
  assert.equal(await settings().locator('#point-minimum').inputValue(), '25');
  await settings().getByRole('button', { name: 'Закрыть', exact: true }).click();
  await settings().waitFor({ state: 'hidden' });
  const jpeg = Buffer.from(await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 360;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#344d67'; ctx.fillRect(0, 0, 480, 360);
    ctx.fillStyle = 'white'; ctx.font = '24px Arial'; ctx.fillText('SYNTHETIC / 0.5.4', 30, 180);
    return [...new Uint8Array(await (await new Promise((r) => canvas.toBlob(r, 'image/jpeg'))).arrayBuffer())];
  }));
  // An upgraded 0.5.3 job: seven singletons, including known 0/1.9 m OCR duplicates.
  const photos = [0, 50, 1.9, 0, 4.1, 100, 129].map((meters, i) => ({
    id: String(i + 1), number: i + 1, fileName: `synthetic-${i + 1}.jpg`,
    coordinates: { latitude: 64 + meters * 180 / (Math.PI * 6371000), longitude: 30 },
    coordinateQuality: 'confident', gpsSource: i % 2 ? 'exif' : 'ocr', gpsConfidence: 0.95, ocrStatus: 'confident',
    indexStatus: 'found', indexFromOcr: String(1000 + i * 1000),
    captureTimeMs: Date.UTC(2026, 0, 1) + i * 86_400_000, captureTimeSource: 'exif', uploadResult: { links: [] },
  }));
  const fixtures = photos.map((p, i) => ({ id: `native-${i + 1}`, name: p.fileName, type: 'image/jpeg', native: true,
    data: syntheticGpsJpeg(jpeg, p).toString('base64') }));
  const rows = establishReviewSlots(photos.map((p) => makePoint([p])), splitBatch(photos, 25));
  rows[0].statusOverride = 'main'; rows[2].statusOverride = 'reserve';
  rows[0].uploadResult = { links: [{ provider: 'onion', url: 'https://example.com/old' }] };
  const manifest = { schemaVersion: 1, files: fixtures.map(({ data, ...file }) => file), rows,
    phase: 'reviewing', indexMode: true, session: 'Поле 0.5.3', color: 'Синий', packing: '2',
    comment: 'Сохранить без OCR', publisher: 'onion', onion: 'http://synthetic.onion', screen: 'photos', resumeAvailable: false };
  await page.evaluate(({ fixtures, manifest }) => {
    localStorage.setItem('fixture.sources', JSON.stringify(Object.fromEntries(fixtures.map((f) => [f.id, f.data]))));
    localStorage.setItem('fixture.files', JSON.stringify(manifest.files));
    localStorage.setItem('fixture.privateIds', JSON.stringify(manifest.files.map((f) => f.id)));
    localStorage.setItem('fixture.manifest', JSON.stringify(manifest));
  }, { fixtures, manifest });
  await page.reload(); await page.getByText('Работа восстановлена.', { exact: true }).waitFor();
  assert.equal(await page.locator('.result-photo-card').count(), 7);
  assert.deepEqual(await counters(), [0, 0]);
  await openSettings();
  await settings().locator('#point-radius').fill('4.5');
  await settings().locator('#point-minimum').fill('30');
  await saveSettings();
  await persisted(() => JSON.parse(localStorage.getItem('darkfoto.settings.v1'))?.minimumDistanceMeters === 30);
  const afterPreferences = await saved();
  assert.deepEqual(afterPreferences.rows.map((p) => p.members), rows.map((p) => p.members), 'settings do not regroup edited membership');
  assert.deepEqual(afterPreferences.rows.map((p) => p.statusOverride), rows.map((p) => p.statusOverride));
  assert.equal(await page.locator('.tolerance-warning').count(), 2);
  assert.match(await card('6').locator('.tolerance-warning').textContent(), /29\.0 м.*минимум 30 м/);
  assert.deepEqual(await counters(), [0, 0]);
  await page.reload(); await page.getByText('Работа восстановлена.', { exact: true }).waitFor();
  await openSettings();
  assert.equal(await settings().locator('#point-radius').inputValue(), '4.5');
  assert.equal(await settings().locator('#point-minimum').inputValue(), '30');
  await settings().locator('#point-radius').fill('4');
  await settings().getByRole('button', { name: 'Перегруппировать текущую сессию' }).click();
  const confirmation = page.locator('.regroup-work-alert');
  await confirmation.getByText(/переносы, удаления/).waitFor();
  await confirmation.getByRole('button', { name: 'Отмена', exact: true }).click();
  await confirmation.waitFor({ state: 'hidden' });
  assert.deepEqual((await saved()).rows.map((p) => p.members), rows.map((p) => p.members));
  assert.deepEqual(await counters(), [0, 0], 'cancel cannot regroup or recognize');
  await openSettings();
  await settings().getByRole('button', { name: 'Перегруппировать текущую сессию' }).click();
  await confirmation.getByRole('button', { name: 'Перегруппировать', exact: true }).click();
  await confirmation.waitFor({ state: 'hidden' });
  await page.getByText('Текущие фото перегруппированы по сохранённым координатам. Проверьте точки перед публикацией.', { exact: true }).waitFor();
  const regrouped = await saved();
  assert.deepEqual(regrouped.rows.map((p) => p.members.map((m) => m.id)), [['1', '3', '4'], ['2'], ['5'], ['6'], ['7']]);
  assert.deepEqual(await counters(), [0, 1], 'explicit repair groups recognized evidence once, zero OCR');
  for (const key of ['files', 'session', 'color', 'packing', 'comment', 'indexMode', 'publisher', 'onion']) assert.deepEqual(regrouped[key], manifest[key]);
  assert.equal(regrouped.rows[0].uploadResult.stale, true);
  assert.deepEqual(regrouped.rows[0].uploadResult.links, []);
  for (const row of regrouped.rows) {
    assert.equal(row.statusOverride, null);
    for (const member of row.members) assert.deepEqual(member.coordinates, photos.find((p) => p.id === member.id).coordinates);
  }
  await page.reload(); await page.getByText('Работа восстановлена.', { exact: true }).waitFor();
  assert.deepEqual((await saved()).rows, regrouped.rows, 'repaired logical job recovered exactly');
  assert.deepEqual(await counters(), [0, 0]);
  await mkdir('output/playwright', { recursive: true });
  for (const [width, height] of [[320, 812], [375, 812], [812, 320], [812, 375]]) {
    await page.setViewportSize({ width, height }); await openSettings();
    const bounds = await settings().locator('ion-content').boundingBox();
    assert.ok(bounds.width <= width && bounds.height > 50);
    assert.equal(await settings().locator('ion-content').evaluate((el) => el.scrollWidth <= el.clientWidth), true);
    assert.equal(await settings().evaluate((el) => getComputedStyle(el.shadowRoot.querySelector('[part~="content"]')).backgroundColor), 'rgb(16, 21, 28)');
    await settings().locator('#point-minimum').scrollIntoViewIfNeeded();
    assert.equal(await settings().locator('#point-minimum').isVisible(), true);
    await settings().locator('#point-radius').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `output/playwright/608-settings-${width}-${height}.png`, animations: 'disabled' });
    await settings().getByRole('button', { name: 'Закрыть', exact: true }).click();
    await settings().waitFor({ state: 'hidden' });
  }
  // Future additions use the new radius without rebuilding any existing membership.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: 'Начать заново', exact: true }).click();
  await page.locator('.reset-work-alert').getByRole('button', { name: 'Очистить', exact: true }).click();
  await page.locator('.reset-work-alert').waitFor({ state: 'hidden' });
  await page.reload(); await page.getByText('Выбрано: 0', { exact: true }).waitFor();
  await openSettings();
  assert.equal(await settings().locator('#point-radius').inputValue(), '4');
  assert.equal(await settings().locator('#point-minimum').inputValue(), '30');
  assert.equal(await settings().getByRole('button', { name: 'Перегруппировать текущую сессию' }).isDisabled(), true);
  assert.equal(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('fixture.sources'))).length), 7);
  assert.deepEqual(errors, []);
  console.log('0.5.4 native-boundary browser: persistent bounded settings; no silent regroup; current restored job repair confirmation/cancel; exact immediate recovery; zero OCR; preserved files/fields/index/GPS; stale publication; 30 m warning; reset keeps settings/sources; four mobile viewports: PASS');
} finally {
  await browser.close(); server.httpServer.closeAllConnections(); await server.close();
}
