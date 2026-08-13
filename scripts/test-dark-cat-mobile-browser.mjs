import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const SESSION_REPOSITORY_KEY = 'dark-cat-crm-sessions-v1';

const fixtureSession = {
  schemaVersion: 2,
  sessionId: 'mobile-smoke-session',
  sessionNumber: 42,
  title: 'Mobile CRM smoke',
  name: 'Mobile CRM smoke',
  color: 'Красный',
  packing: '10 шт.',
  description: 'Проверка mobile flow',
  status: 'attention',
  stage: 'result',
  thresholdMeters: 25,
  providerSettings: { ninjabox: true, fallbackFreeimage: true, fallbackX0: true },
  regionMode: 'auto',
  mapLayerId: 'osm',
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z',
  photos: [
    {
      photoId: 'mobile-a', number: 1, fileName: 'a.jpg', indexFromOcr: '101', indexStatus: 'found',
      coordinates: { latitude: 64.100000, longitude: 30.100000 }, gpsSource: 'manual', gpsStatus: 'done',
      coordinateQuality: 'manual', ocrStatus: 'manual', status: 'uploaded', cleanupStatus: 'done', uploadStatus: 'done',
      workStatus: 'active', disposition: 'active', reserveReason: '',
      uploadResult: { links: [{ provider: 'ninjabox', url: 'https://example.test/a' }] },
    },
    {
      photoId: 'mobile-b', number: 2, fileName: 'b.jpg', indexFromOcr: '102', indexStatus: 'found',
      coordinates: { latitude: 64.100010, longitude: 30.100010 }, gpsSource: 'manual', gpsStatus: 'done',
      coordinateQuality: 'manual', ocrStatus: 'manual', status: 'uploaded', cleanupStatus: 'done', uploadStatus: 'done',
      workStatus: 'active', disposition: 'active', reserveReason: '',
      uploadResult: { links: [{ provider: 'ninjabox', url: 'https://example.test/b' }] },
    },
    {
      photoId: 'mobile-c', number: 3, fileName: 'c.jpg', indexFromOcr: '103', indexStatus: 'found',
      coordinates: { latitude: 64.105000, longitude: 30.105000 }, gpsSource: 'manual', gpsStatus: 'done',
      coordinateQuality: 'manual', ocrStatus: 'manual', status: 'uploaded', cleanupStatus: 'done', uploadStatus: 'done',
      workStatus: 'active', disposition: 'active', reserveReason: '',
      uploadResult: { links: [{ provider: 'ninjabox', url: 'https://example.test/c' }] },
    },
  ],
};

const noHorizontalScroll = async (page) => page.evaluate(() => (
  document.documentElement.scrollWidth <= window.innerWidth + 1
  && document.body.scrollWidth <= window.innerWidth + 1
));

const assertLayout = async (page, label) => {
  assert.equal(await noHorizontalScroll(page), true, `${label}: horizontal overflow`);
};

const openMobileScreen = async (page, label) => {
  await page.getByRole('button', { name: 'Открыть меню' }).click();
  await page.locator('.ant-drawer-content').getByRole('menuitem', { name: label }).click();
};

const server = await createServer({
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
});
await server.listen();
const baseUrl = server.resolvedUrls.local[0];
const browser = await chromium.launch({ headless: true });

try {
  for (const viewport of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 412, height: 915 },
  ]) {
    const page = await browser.newPage({ viewport });
    await page.route('**/api/sessions*', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, sessions: [fixtureSession], nextSessionNumber: 43, dashboard: { sessionCount: 1, photoCount: 3, activeCount: 3 } }),
    }));
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.addInitScript(({ key, session }) => {
      localStorage.setItem(key, JSON.stringify({ schemaVersion: 2, nextSessionNumber: 43, sessions: [session] }));
    }, { key: SESSION_REPOSITORY_KEY, session: fixtureSession });
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await assertLayout(page, `${viewport.width}px dashboard`);

    await openMobileScreen(page, 'История');
    await page.getByRole('button', { name: 'Открыть', exact: true }).click();
    await page.getByRole('heading', { name: 'Сводка текущей проверки' }).waitFor();
    await page.getByRole('button', { name: 'Скачать TXT' }).waitFor();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const stepActionBar = page.locator('.session-step-action-bar');
    await stepActionBar.getByRole('button', { name: 'Сохранить результат', exact: true }).waitFor();
    const stepActionBox = await stepActionBar.boundingBox();
    assert.ok(stepActionBox && stepActionBox.y >= 0 && stepActionBox.y + stepActionBox.height <= viewport.height, `${viewport.width}px sticky step CTA is visible after scroll`);
    assert.equal(await page.evaluate(() => !document.querySelector('.session-wizard .session-step-action-bar')), true, `${viewport.width}px CTA must not be constrained by wizard card`);
    await assertLayout(page, `${viewport.width}px result`);

    await openMobileScreen(page, 'Карта');
    await page.locator('.map-panel').waitFor();
    await page.getByRole('button', { name: 'Показать точки' }).click();
    await page.locator('.map-panel.panel-open .map-side-panel').waitFor();
    await page.getByRole('button', { name: 'Принять рекомендацию' }).click();
    await assertLayout(page, `${viewport.width}px map`);

    await openMobileScreen(page, 'История');
    await page.getByRole('tab', { name: /RESERVE/ }).click();
    await page.getByRole('heading', { name: 'Логически исключённые точки' }).waitFor();
    await page.getByText('RESERVE').first().waitFor();
    await assertLayout(page, `${viewport.width}px reserve`);

    await openMobileScreen(page, 'Сессия');
    await page.getByRole('heading', { name: 'Рабочая сессия' }).waitFor();
    await assertLayout(page, `${viewport.width}px wizard`);

    await openMobileScreen(page, 'Настройки');
    await page.getByRole('heading', { name: 'Параметры проверки' }).waitFor();
    await assertLayout(page, `${viewport.width}px settings`);
    assert.deepEqual(pageErrors, []);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}

console.log('Dark Cat CRM mobile browser smoke passed at 360x800, 390x844 and 412x915.');
