import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const LAST_SESSION_KEY = 'gps-checker-last-session-v1';
const MAP_LAYER_STORAGE_KEY = 'gps-checker-map-layer-v1';

const session = {
  version: 1,
  sessionId: 'map-viewport-test',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  thresholdMeters: 25,
  activeScreen: 'map',
  providerSettings: { freeimage: true, ninjabox: true, includeX0: false, fallbackX0: true },
  photos: [
    {
      photoId: 'a',
      number: 1,
      fileName: 'a.jpg',
      size: 1000,
      indexFromOcr: '0123',
      indexStatus: 'found',
      coordinates: { latitude: 55.7558, longitude: 37.6173 },
      gpsSource: 'ocr',
      gpsStatus: 'done',
      gpsConfidence: 0.9,
      ocrStatus: 'confident',
      coordinateQuality: 'confident',
      status: 'distance_ready',
      statusText: 'Расстояния рассчитаны',
      distanceStatus: 'too_close',
      distanceConflicts: ['0123 - 12345: 1.3 м'],
      cleanupStatus: 'idle',
      uploadStatus: 'idle',
    },
    {
      photoId: 'b',
      number: 2,
      fileName: 'b.jpg',
      size: 1000,
      indexFromOcr: '12345',
      indexStatus: 'found',
      coordinates: { latitude: 55.75581, longitude: 37.61731 },
      gpsSource: 'manual',
      gpsStatus: 'done',
      gpsConfidence: 1,
      ocrStatus: 'manual',
      manualCoordinates: true,
      coordinateQuality: 'manual',
      status: 'distance_ready',
      statusText: 'Расстояния рассчитаны',
      distanceStatus: 'too_close',
      distanceConflicts: ['0123 - 12345: 1.3 м'],
      cleanupStatus: 'idle',
      uploadStatus: 'idle',
    },
    {
      photoId: 'c',
      number: 3,
      fileName: 'c.jpg',
      size: 1000,
      indexFromOcr: '4821',
      indexStatus: 'found',
      coordinates: { latitude: 55.762, longitude: 37.629 },
      gpsSource: 'ocr',
      gpsStatus: 'done',
      gpsConfidence: 0.9,
      ocrStatus: 'confident',
      coordinateQuality: 'confident',
      status: 'distance_ready',
      statusText: 'Расстояния рассчитаны',
      distanceStatus: 'ok',
      distanceConflicts: [],
      cleanupStatus: 'idle',
      uploadStatus: 'idle',
    },
  ],
};

const state = async (page) => page.evaluate(() => {
  const map = window.__gpsCheckerMap;
  const center = map.getCenter();
  return { zoom: map.getZoom(), lat: center.lat, lng: center.lng };
});

const assertSameViewport = (actual, expected, label) => {
  assert.equal(actual.zoom, expected.zoom, `${label}: zoom changed`);
  assert.ok(Math.abs(actual.lat - expected.lat) < 1e-10, `${label}: latitude changed ${actual.lat} != ${expected.lat}`);
  assert.ok(Math.abs(actual.lng - expected.lng) < 1e-10, `${label}: longitude changed ${actual.lng} != ${expected.lng}`);
};

const noHorizontalScroll = async (page) => page.evaluate(() => (
  document.documentElement.scrollWidth <= window.innerWidth + 1
  && document.body.scrollWidth <= window.innerWidth + 1
));

const server = await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const baseUrl = server.resolvedUrls.local[0];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const consoleErrors = [];
const pageErrors = [];
const blankTile = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
);

page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(error.message));
const fulfillTile = (route) => route.fulfill({
  status: 200,
  contentType: 'image/png',
  body: blankTile,
});
await page.route('https://*.tile.openstreetmap.org/**', fulfillTile);
await page.route('https://tiles.maps.eox.at/**', fulfillTile);
await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
  key: LAST_SESSION_KEY,
  value: session,
});

try {
  await page.goto(`${baseUrl}?debug=1`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Восстановить' }).click();
  await page.waitForFunction(() => window.__gpsCheckerMap);
  await page.waitForSelector('.leaflet-container .map-marker');
  await page.waitForTimeout(300);

  assert.equal(await page.evaluate(() => window.__gpsCheckerMapLayer), 'hybrid');
  const mapLayerSelect = page.getByRole('combobox', { name: 'Слой карты' });
  await mapLayerSelect.selectOption('satellite');
  await page.waitForFunction(() => window.__gpsCheckerMapLayer === 'satellite');
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), MAP_LAYER_STORAGE_KEY), 'satellite');
  await mapLayerSelect.selectOption('osm');
  await page.waitForFunction(() => window.__gpsCheckerMapLayer === 'osm');
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), MAP_LAYER_STORAGE_KEY), 'osm');

  const lineState = await page.evaluate(() => ({
    paths: [...document.querySelectorAll('.leaflet-overlay-pane path')].map((path) => ({
      dash: path.getAttribute('stroke-dasharray') || '',
      stroke: path.getAttribute('stroke') || '',
    })),
    markerClasses: [...document.querySelectorAll('.map-marker')].map((marker) => marker.className),
    dotClasses: [...document.querySelectorAll('.point-dot')].map((dot) => dot.className),
  }));
  assert.equal(lineState.paths.length, 1, 'only one conflict line should be visible');
  assert.equal(lineState.paths[0].dash, '', 'conflict line must not be dashed');
  assert.ok(lineState.markerClasses.some((className) => className.includes('is-conflict')), 'conflict marker class missing');
  assert.ok(lineState.markerClasses.some((className) => !className.includes('is-conflict')), 'ordinary marker class missing');
  assert.ok(lineState.dotClasses.some((className) => className.includes('is-conflict')), 'conflict dot class missing');

  await page.evaluate(() => {
    const map = window.__gpsCheckerMap;
    map.setView([55.758, 37.621], 16, { animate: false });
    map.panBy([120, 80], { animate: false });
  });
  const beforeMarker = await state(page);
  await page.locator('.map-marker').nth(1).click({ force: true });
  await page.waitForTimeout(150);
  assertSameViewport(await state(page), beforeMarker, 'marker selection');
  assert.ok(await page.locator('.map-marker.is-selected').count() >= 1, 'selected marker class missing');
  assert.ok(await page.locator('.map-marker.is-conflict.is-selected').count() >= 1, 'selected conflict marker should stay red/conflict');

  await page.getByRole('button', { name: /4821/ }).click();
  await page.waitForTimeout(150);
  assertSameViewport(await state(page), beforeMarker, 'side list selection');

  await page.getByRole('button', { name: 'Показать все точки' }).click();
  await page.waitForTimeout(250);
  const afterFit = await state(page);
  assert.ok(
    afterFit.zoom !== beforeMarker.zoom
      || Math.abs(afterFit.lat - beforeMarker.lat) > 1e-8
      || Math.abs(afterFit.lng - beforeMarker.lng) > 1e-8,
    'show all points button should change viewport from the manually panned view',
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    window.__gpsCheckerMap.setView([55.7585, 37.622], 15, { animate: false });
  });
  const beforeSheet = await state(page);
  await page.getByRole('button', { name: 'Показать точки' }).click();
  await page.waitForTimeout(150);
  assertSameViewport(await state(page), beforeSheet, 'mobile bottom sheet open');
  await page.getByRole('button', { name: 'Скрыть точки' }).click();
  await page.waitForTimeout(150);
  assertSameViewport(await state(page), beforeSheet, 'mobile bottom sheet close');
  assert.equal(await noHorizontalScroll(page), true, '390px horizontal scroll');
  await page.setViewportSize({ width: 360, height: 844 });
  await page.waitForTimeout(150);
  assert.equal(await noHorizontalScroll(page), true, '360px horizontal scroll');

  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);
} finally {
  await browser.close();
  await server.close();
}

console.log('Map viewport tests passed');
