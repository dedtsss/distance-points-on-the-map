import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const LAST_SESSION_KEY = 'gps-checker-last-session-v1';
const distRoot = path.resolve('dist');

const session = {
  version: 1,
  sessionId: 'preview-smoke-session',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  thresholdMeters: 25,
  activeScreen: 'dashboard',
  providerSettings: { freeimage: true, ninjabox: true, includeX0: false, fallbackX0: true },
  photos: [
    {
      photoId: 'smoke-a',
      number: 1,
      fileName: 'smoke-a.jpg',
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
      photoId: 'smoke-b',
      number: 2,
      fileName: 'smoke-b.jpg',
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
      photoId: 'smoke-c',
      number: 3,
      fileName: 'smoke-c.jpg',
      size: 1000,
      indexFromOcr: '00042',
      indexStatus: 'uncertain',
      coordinates: { latitude: 55.762, longitude: 37.629 },
      gpsSource: 'ocr',
      gpsStatus: 'done',
      gpsConfidence: 0.8,
      ocrStatus: 'uncertain',
      coordinateQuality: 'low_precision',
      status: 'distance_ready',
      statusText: 'Расстояния рассчитаны',
      distanceStatus: 'ok',
      distanceConflicts: [],
      cleanupStatus: 'idle',
      uploadStatus: 'idle',
    },
  ],
};

const contentType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.js') return 'text/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'application/octet-stream';
};

const resolveDistFile = async (urlPath) => {
  const decoded = decodeURIComponent(urlPath);
  const normalized = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(distRoot, normalized === '/' ? 'index.html' : normalized);
  if (!filePath.startsWith(distRoot)) return null;
  try {
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) filePath = path.join(filePath, 'index.html');
    await stat(filePath);
    return filePath;
  } catch {
    return path.join(distRoot, 'index.html');
  }
};

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
    if (requestUrl.pathname === '/api/upload') {
      response.writeHead(405, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: 'preview_smoke_no_upload' }));
      return;
    }
    if (requestUrl.pathname === '/api/sessions') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ ok: true, sessions: [], nextSessionNumber: 1, dashboard: {} }));
      return;
    }
    const filePath = await resolveDistFile(requestUrl.pathname);
    if (!filePath) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }
    response.writeHead(200, { 'content-type': contentType(filePath) });
    response.end(await readFile(filePath));
  } catch (error) {
    response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(error instanceof Error ? error.message : String(error));
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}/`;
const blankTile = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];

const visible = async (locator, label) => {
  assert.equal(await locator.first().isVisible(), true, `${label} should be visible`);
};

const nav = (label) => page.locator('.sidebar-shell').getByRole('button', { name: label });
const noHorizontalScroll = async () => page.evaluate(() => (
  document.documentElement.scrollWidth <= window.innerWidth + 1
  && document.body.scrollWidth <= window.innerWidth + 1
));

page.on('console', (message) => {
  if (message.type() === 'error') {
    const location = message.location();
    consoleErrors.push(`${message.text()}${location.url ? ` (${location.url})` : ''}`);
  }
});
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('requestfailed', (request) => {
  const url = request.url();
  if (!url.includes('tile.openstreetmap.org')) failedRequests.push(`${request.method()} ${url}`);
});
await page.route('https://*.tile.openstreetmap.org/**', (route) => route.fulfill({
  status: 200,
  contentType: 'image/png',
  body: blankTile,
}));
await page.route('https://tiles.maps.eox.at/**', (route) => route.fulfill({
  status: 200,
  contentType: 'image/png',
  body: blankTile,
}));
await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
  key: LAST_SESSION_KEY,
  value: session,
});

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Восстановить' }).click();

  await visible(page.getByRole('heading', { name: 'Обзор текущей проверки' }), 'dashboard');
  await visible(page.getByText('0123').first(), 'four-digit index');
  await visible(page.getByText('12345').first(), 'five-digit index');

  await nav('Загрузка и проверка').click();
  await visible(page.getByRole('heading', { name: 'Новая проверка фотографий' }), 'upload screen');

  await nav('Результаты').click();
  await visible(page.getByRole('heading', { name: 'Сводка текущей проверки' }), 'results screen');
  await visible(page.getByText('Индекс: 00042 — проверить').first(), 'mobile/desktop result index text');

  await nav('Карта').click();
  await page.waitForSelector('.leaflet-container .map-marker');
  await visible(page.getByRole('button', { name: 'Показать все точки' }), 'show all points button');
  assert.equal(await page.locator('.leaflet-overlay-pane path').count(), 1, 'only conflict lines should render');
  assert.equal(await page.locator('.map-marker.is-conflict').count(), 2, 'conflict markers should stay red');
  assert.equal(await page.locator('.map-marker:not(.is-conflict)').count(), 1, 'ordinary markers should use one class');

  await nav('Сессии').click();
  await visible(page.getByRole('heading', { name: 'Сессии обработки' }), 'sessions screen');

  await nav('Журнал').click();
  await visible(page.getByRole('heading', { name: 'События и диагностика OCR' }), 'journal screen');

  await nav('Настройки').click();
  await visible(page.getByRole('heading', { name: 'Параметры проверки' }), 'settings screen');
  await visible(page.getByText('О приложении'), 'about/build info');
  await visible(page.getByText('/api/upload'), 'same-origin upload text');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Открыть меню' }).click();
  await visible(page.locator('.mobile-nav-drawer.is-open'), 'mobile drawer');
  await page.locator('.mobile-nav-drawer').getByRole('button', { name: 'Карта' }).click();
  await page.waitForSelector('.leaflet-container .map-marker');
  await page.getByRole('button', { name: 'Показать точки' }).click();
  await visible(page.locator('.map-panel.panel-open .map-side-panel'), 'mobile map bottom sheet');
  await page.getByRole('button', { name: 'Скрыть точки' }).click();
  assert.equal(await noHorizontalScroll(), true, '390px horizontal scroll');
  await page.setViewportSize({ width: 360, height: 844 });
  assert.equal(await noHorizontalScroll(), true, '360px horizontal scroll');

  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(failedRequests, []);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

console.log('Preview smoke tests passed');
