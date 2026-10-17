import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const live = process.env.DARKCAT_MAP_LIVE === '1';
const server = await createServer({ configFile: new URL('../vite.config.js', import.meta.url).pathname,
  root: new URL('..', import.meta.url).pathname, logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('requestfailed', (request) => {
  if (live && request.url().startsWith('https://tiles.openfreemap.org/'))
    console.error('OpenFreeMap request failed:', request.url(), request.failure()?.errorText);
});
let styleMode = 'success', styleRequests = 0, tileResponses = 0;
page.on('response', (response) => {
  if (response.url().startsWith('https://tiles.openfreemap.org/') && /\.(pbf|png)(\?|$)/.test(response.url()) && response.ok()) tileResponses++;
});
if (!live) {
  // Real MapLibre/WebGL/worker; only the external provider is deterministic.
  // Production-style rendering is checked separately with DARKCAT_MAP_LIVE=1.
  await page.route('https://tiles.openfreemap.org/styles/liberty', async (route) => {
    styleRequests++;
    if (styleMode === 'failure') return route.fulfill({ status: 503, body: 'unavailable' });
    if (styleMode === 'timeout') { await new Promise((resolve) => setTimeout(resolve, 16000)); }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: 8,
      sources: { fixture: { type: 'geojson', data: { type: 'FeatureCollection', features: [] },
        attribution: '<a href="https://openfreemap.org/">OpenFreeMap</a> © OpenMapTiles | Data from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' } },
      layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#f2efe9' } },
        { id: 'fixture', source: 'fixture', type: 'circle' }] }) });
  });
}
await page.route('**/src/core/readPhoto.js', (route) => route.fulfill({ contentType: 'application/javascript', body: `
export async function readPhoto(file) {
  const n = Number(file.name.match(/source-(\\d+)/)[1]);
  return { coordinates: n === 6 ? null : { latitude: 64, longitude: 30 + ({ 1: 0, 2: .00001, 3: .00035, 4: .002, 5: .01, 7: .02, 8: 0 }[n]) },
    coordinateQuality: 'confident', gpsSource: 'exif', gpsStatus: 'done',
    indexFromOcr: n === 4 || n === 6 ? null : String(7000 + n), indexStatus: n === 4 || n === 6 ? 'missing' : 'found', orientation: 1,
    accuracyMeters: n, captureTimeMs: 1700000000000 + (n === 8 ? 240000 : n * 1000), captureTimeSource: 'exif' };
}` }));
const tabs = page.locator('ion-segment-button');
const mapTab = async () => {
  await page.locator('ion-segment.hydrated ion-segment-button.hydrated').nth(1).waitFor();
  await tabs.nth(1).click(); await page.locator('.session-map').waitFor({ state: 'visible' });
};
const pointsTab = async () => { await tabs.nth(0).click(); await page.locator('.intro').waitFor({ state: 'visible' }); };
const marker = (id) => page.locator(`.session-map-marker[data-point-id="${id}"]`);
const card = (id) => page.locator(`.result-photo-card[data-point-id="${id}"]`);
const focused = async (id, label) => {
  await page.locator('.map-preview strong').filter({ hasText: label }).waitFor();
  assert.equal(await marker(id).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('.session-map-marker[aria-pressed=true]').count(), 1);
  const center = await page.locator('.map-canvas').boundingBox();
  const pill = await marker(id).boundingBox();
  assert.ok(Math.abs(pill.x + pill.width / 2 - center.x - center.width / 2) < 2);
  assert.ok(Math.abs(pill.y + pill.height / 2 - center.y - center.height / 2) < 2, 'requested point centered');
};
const pointAct = async (id, action) => {
  await card(id).getByRole('button', { name: /Действия точки/ }).click();
  await page.locator('.point-action-sheet').getByRole('button', { name: action, exact: true }).click();
  await page.locator('.point-action-sheet').waitFor({ state: 'hidden' });
};
const memberAct = async (id, member, action) => {
  await card(id).locator(`[data-member-id="${member}"]`).getByRole('button', { name: /Действия фото/ }).click();
  await page.locator('.photo-action-sheet').getByRole('button', { name: action, exact: true }).click();
  await page.locator('.photo-action-sheet').waitFor({ state: 'hidden' });
};
const ready = async () => {
  // A retry click schedules a React effect. Wait for the old error panel to
  // leave before checking the new attempt, rather than accepting old markers.
  await page.locator('.map-error').waitFor({ state: 'hidden' });
  await page.locator('.session-map-marker').first().waitFor();
  await page.locator('.map-loading').waitFor({ state: 'hidden', timeout: 20000 });
  assert.equal(await page.locator('.map-error').count(), 0, 'basemap must finish without error');
};
try {
  await page.goto(server.resolvedUrls.local[0]);
  await page.getByRole('checkbox', { name: 'Учитывать номер/индекс на фото' }).check();
  await mapTab();
  await page.getByText(/нет активных точек с координатами/).waitFor();
  assert.equal(styleRequests, 0, 'empty state performs no provider requests');
  await pointsTab();
  const buffer = await readFile(new URL('fixtures/representative-6300.jpg', import.meta.url));
  const file = (n) => ({ name: `source-${n}.jpg`, mimeType: 'image/jpeg', buffer });
  await page.locator('input[type=file]').first().setInputFiles([1, 2, 3, 4, 5, 6].map(file));
  await page.getByRole('button', { name: 'Обработать фото', exact: true }).click();
  await page.getByRole('heading', { name: 'Проверка точек' }).waitFor();
  assert.equal(await page.locator('.result-photo-card').count(), 5);
  assert.equal(await card('6').getByRole('button', { name: 'На карте', exact: true }).isDisabled(), true);
  await card('3').getByRole('button', { name: 'На карте', exact: true }).click();
  await ready(); await focused('3', '#7003');
  const close = await marker('3').boundingBox();
  const distant = await marker('5').boundingBox();
  assert.ok(Math.abs(distant.x - close.x) > 375, 'card navigation zooms to a useful close scale');
  assert.equal(await page.locator('.session-map-marker').count(), 4);
  assert.equal(await page.locator('.session-map-marker-main').count(), 2);
  assert.equal(await page.locator('.session-map-marker-reserve').count(), 1);
  assert.equal(await page.locator('.session-map-marker-review').count(), 1);
  const credits = await page.locator('.maplibregl-ctrl-attrib').textContent();
  assert.match(credits, /MapLibre.*OpenFreeMap/);
  assert.equal((credits.match(/OpenFreeMap/g) || []).length, 1, 'provider credit appears once');
  assert.match(await page.locator('.maplibregl-ctrl-attrib').textContent(), /OpenStreetMap/);
  assert.match(await page.locator('.maplibregl-ctrl-attrib').textContent(), /OpenMapTiles/);
  assert.equal(await page.locator('.map-canvas').getAttribute('aria-label'), 'OpenFreeMap Liberty');
  const weight = await marker('5').evaluate((el) => ({ height: el.getBoundingClientRect().height, weight: getComputedStyle(el).fontWeight,
    border: getComputedStyle(el).borderTopWidth, touchHeight: getComputedStyle(el, '::after').minHeight }));
  assert.ok(weight.height <= 28, 'marker pill is substantially smaller than the former 48px plaque');
  assert.equal(weight.weight, '400'); assert.equal(weight.border, '1px'); assert.equal(weight.touchHeight, '44px');
  await page.evaluate(() => { globalThis.__mapCanvas = document.querySelector('.map-canvas canvas'); });
  for (const [width, height] of [[320, 812], [375, 812], [812, 320], [812, 375]]) {
    await page.setViewportSize({ width, height });
    await page.getByRole('button', { name: 'Показать все', exact: true }).click();
    await page.waitForTimeout(100);
    if (live) await page.waitForLoadState('networkidle');
    const fitPositions = await page.locator('.map-canvas').evaluate((canvas) => {
      const frame = canvas.getBoundingClientRect();
      return [...canvas.querySelectorAll('.session-map-marker')].map((marker) => {
        const rect = marker.getBoundingClientRect();
        return rect.x >= frame.x && rect.right <= frame.right && rect.y >= frame.y && rect.bottom <= frame.bottom;
      });
    });
    assert.ok(fitPositions.every(Boolean), 'fit includes every current marker inside the canvas');
    await marker('5').click();
    await page.locator('.map-preview').waitFor();
    assert.match(await page.locator('.map-preview').textContent(), /#7005.*Основное.*1 фото.*64, 30\.01.*Открыть точку/s);
    assert.equal(await page.locator('.map-preview img').count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.locator('.session-map').evaluate((el) => el.scrollWidth <= el.clientWidth), true);
    const attribution = await page.locator('.maplibregl-ctrl-attrib').boundingBox();
    const frame = await page.locator('.map-frame').boundingBox();
    assert.ok(attribution.x >= frame.x + 5 && attribution.x <= frame.x + 8, 'attribution inset at bottom left');
    assert.ok(attribution.x + attribution.width <= frame.x + frame.width - 5);
    assert.ok(attribution.y + attribution.height <= frame.y + frame.height - 5);
    await mkdir('/tmp/darkcat-stage-b', { recursive: true });
    await page.screenshot({ path: `/tmp/darkcat-stage-b/map-${live ? 'live' : 'fixture'}-${width}-${height}.png` });
  }
  if (live) assert.ok(tileResponses > 0, 'real production basemap tiles rendered, not just local markers');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.locator('.map-preview').getByRole('button', { name: 'Открыть точку', exact: true }).click();
  await card('5').waitFor();
  await page.waitForFunction(() => document.activeElement.dataset.pointId === '5');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.pointId), '5');
  assert.equal(await card('5').evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 56 && r.bottom <= innerHeight; }), true);
  await page.screenshot({ path: '/tmp/darkcat-stage-b/point-handoff-375.png' });

  // Pan once; keep the same canvas and viewport through edits/tab changes.
  await mapTab();
  await page.locator('.map-canvas').scrollIntoViewIfNeeded();
  const canvas = await page.locator('.map-canvas').boundingBox();
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + 40); await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width / 2 + 30, canvas.y + 40, { steps: 10 }); await page.mouse.up();
  await page.waitForTimeout(500);
  const unchanged = await marker('5').getAttribute('style');
  await pointsTab();
  await memberAct('point:1:2', '1', 'Убрать фото');
  await mapTab();
  await marker('point:1:2').press('Enter');
  await page.locator('.map-preview').filter({ hasText: /1 фото.*64, 30\.00001/s }).waitFor();
  assert.match(await page.locator('.map-preview').textContent(), /1 фото.*64, 30\.00001/s);
  assert.equal(await marker('5').getAttribute('style'), unchanged, 'membership edits preserve user viewport');
  assert.equal(await page.evaluate(() => globalThis.__mapCanvas === document.querySelector('.map-canvas canvas')), true);
  await pointsTab();
  await card('point:1:2').getByRole('button', { name: /Вернуть фото точки/ }).click();
  await mapTab();
  await page.locator('.map-preview').filter({ hasText: /2 фото.*64, 30(?:\D|$)/s }).waitFor();
  assert.match(await page.locator('.map-preview').textContent(), /2 фото.*64, 30(?:\D|$)/s);
  await pointsTab();
  await memberAct('point:1:2', '2', 'Переместить');
  await page.locator('.move-photo-modal ion-item').filter({ hasText: '#7005' }).click();
  await page.locator('.move-photo-modal').waitFor({ state: 'hidden' });
  await mapTab(); await marker('5').press('Enter');
  await page.locator('.map-preview').filter({ hasText: /2 фото.*64, 30\.00001/s }).waitFor();
  assert.match(await page.locator('.map-preview').textContent(), /2 фото.*64, 30\.00001/s, 'move changes representative/count in destination');
  await pointsTab();
  await pointAct('3', 'Убрать');
  await mapTab();
  assert.equal(await marker('3').count(), 0);
  assert.equal(await page.locator('.session-map-marker').count(), 3);
  await pointsTab();
  await card('3').getByRole('button', { name: 'Вернуть', exact: true }).click();
  await page.locator('[data-testid="append-photos"]').setInputFiles([file(7)]);
  await page.getByText(/Добавлено 1 фото/).waitFor();
  await mapTab();
  assert.equal(await page.locator('.session-map-marker').count(), 5);
  assert.equal(await marker('7').count(), 1);
  assert.equal(await marker('6').count(), 0, 'point without coordinates never appears');
  await pointsTab();
  await page.locator('[data-testid="append-photos"]').setInputFiles([file(8)]);
  await card('8').waitFor(); await mapTab();
  await page.getByRole('button', { name: 'Показать все', exact: true }).click();
  await marker('5').click();
  await page.getByLabel('Близкие точки (до 25 м)').selectOption('8');
  await page.locator('.map-preview strong').filter({ hasText: '#7008' }).waitFor();
  await page.screenshot({ path: `/tmp/darkcat-stage-b/map-${live ? 'live' : 'fixture'}-coincident-375.png` });
  await page.getByLabel('Близкие точки (до 25 м)').selectOption('point:1:2');
  await page.locator('.map-preview').filter({ hasText: /#7001.*1 фото/s }).waitFor();
  await page.locator('.map-preview').getByRole('button', { name: 'Открыть точку', exact: true }).click();
  await card('point:1:2').waitFor();
  await page.waitForFunction(() => document.activeElement.dataset.pointId === 'point:1:2');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.pointId), 'point:1:2', 'coincident point selection opens its exact logical card');
  // Request each coincident logical identity from its own card, even if
  // another marker/preview at those coordinates was selected previously.
  await mkdir('/tmp/darkcat-051', { recursive: true });
  for (const [id, label] of [['8', '#7008'], ['point:1:2', '#7001'], ['8', '#7008']]) {
    await card(id).getByRole('button', { name: 'На карте', exact: true }).click();
    await focused(id, label);
    assert.equal(await page.evaluate(() => globalThis.__mapCanvas === document.querySelector('.map-canvas canvas')), true);
    await page.screenshot({ path: `/tmp/darkcat-051/map-${live ? 'live' : 'fixture'}-identity-${id.replaceAll(':', '-')}.png` });
    await page.locator('.map-preview').getByRole('button', { name: 'Открыть точку', exact: true }).click();
    await page.waitForFunction((id) => document.activeElement.dataset.pointId === id, id);
  }
  if (!live) {
    styleMode = 'failure';
    // Start a fresh map page to test initial failure and retry without test-only
    // product APIs or replacing the MapLibre engine.
    await page.reload(); await pointsTab();
    await page.getByRole('checkbox', { name: 'Учитывать номер/индекс на фото' }).check();
    await page.locator('input[type=file]').first().setInputFiles([file(5)]);
    await page.getByRole('button', { name: 'Обработать фото', exact: true }).click();
    await page.getByRole('heading', { name: 'Проверка точек' }).waitFor();
    await mapTab(); await page.locator('.map-error').waitFor();
    assert.equal(await page.locator('.map-loading').count(), 0);
    styleMode = 'success'; await page.getByRole('button', { name: 'Повторить загрузку карты' }).click(); await ready();
    styleMode = 'timeout';
    await page.reload(); await pointsTab();
    await page.getByRole('checkbox', { name: 'Учитывать номер/индекс на фото' }).check();
    await page.locator('input[type=file]').first().setInputFiles([file(5)]);
    await page.getByRole('button', { name: 'Обработать фото', exact: true }).click();
    await page.getByRole('heading', { name: 'Проверка точек' }).waitFor();
    await mapTab();
    const started = Date.now();
    await page.locator('.map-error').waitFor({ timeout: 18000 });
    assert.ok(Date.now() - started < 17500, 'loading timeout is bounded');
    styleMode = 'success'; await page.getByRole('button', { name: 'Повторить загрузку карты' }).click(); await ready();
    await pointsTab(); await pointAct('1', 'Убрать'); await mapTab();
    await page.getByText(/нет активных точек с координатами/).waitFor();
    assert.equal(await page.locator('.map-preview').count(), 0);
    await pointsTab(); await card('1').getByRole('button', { name: 'Вернуть', exact: true }).click();
    await mapTab(); await ready();
    assert.equal(await page.locator('.session-map-marker').count(), 1, 'empty -> restore while hidden starts and fits a new map');
  }
  await pointsTab();
  await page.getByRole('button', { name: 'Начать заново', exact: true }).click();
  await page.locator('.reset-work-alert').getByRole('button', { name: 'Очистить', exact: true }).click();
  await page.locator('.reset-work-alert').waitFor({ state: 'hidden' });
  await page.getByText('Выбрано: 0', { exact: true }).waitFor();
  await page.waitForFunction(async () => (await document.querySelector('.darkfoto-content').getScrollElement()).scrollTop === 0);
  await mapTab();
  await page.getByText(/нет активных точек с координатами/).waitFor();
  assert.equal(await page.locator('.map-preview, .session-map-marker, .map-canvas canvas').count(), 0, 'reset discards selection and the old map instance');
  assert.deepEqual(errors, []);
  console.log(`0.5.1 ${live ? 'LIVE OpenFreeMap Liberty' : 'deterministic provider / real MapLibre WebGL'}: thin compact status markers/aligned attribution/exact bidirectional coincident identity/live membership+coordinates+remove+restore+append/viewport/320+375 portrait+landscape/confirmed reset${live ? '' : '/error+retry+empty-restore'}: PASS (${tileResponses} production tile responses)`);
} catch (error) {
  console.error(error);
  console.error(await page.locator('body').innerText());
  await page.screenshot({ path: '/tmp/darkcat-051-map-failed.png' });
  throw error;
} finally {
  await browser.close(); server.httpServer.closeAllConnections(); await server.close();
}
