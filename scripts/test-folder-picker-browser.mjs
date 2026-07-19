import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const LAST_SESSION_KEY = 'gps-checker-last-session-v1';
const imageBytes = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00, 0xff, 0xd9]);

const visible = async (locator, label) => {
  assert.equal(await locator.first().isVisible(), true, `${label} should be visible`);
};

const noHorizontalScroll = async (page) => page.evaluate(() => (
  document.documentElement.scrollWidth <= window.innerWidth + 1
  && document.body.scrollWidth <= window.innerWidth + 1
));

const summaryText = (page) => page.locator('.folder-import-summary').innerText();

const openUploadScreen = async (page) => {
  const desktopNav = page.locator('.sidebar-shell').getByRole('button', { name: 'Загрузка и проверка' });
  if ((await desktopNav.count()) && await desktopNav.first().isVisible()) {
    await desktopNav.click();
  } else {
    await page.getByRole('button', { name: 'Открыть меню' }).click();
    await page.locator('.mobile-nav-drawer').getByRole('button', { name: 'Загрузка и проверка' }).click();
  }
  await visible(page.getByRole('heading', { name: 'Новая проверка фотографий' }), 'upload screen');
};

const desktopNav = (page, label) => page.locator('.sidebar-shell').getByRole('button', { name: label });

const assertImportEvent = async (page, source, count) => {
  await page.waitForFunction(
    ({ expectedSource, expectedCount }) => (
      window.__gpsImportEvents?.some((event) => event.source === expectedSource && event.photos.length === expectedCount)
    ),
    { expectedSource: source, expectedCount: count },
  );
  const event = await page.evaluate(({ expectedSource, expectedCount }) => (
    window.__gpsImportEvents.find((item) => item.source === expectedSource && item.photos.length === expectedCount)
  ), { expectedSource: source, expectedCount: count });
  assert.ok(event.photos.every((photo) => photo.stableFileIsFile), `${source} should create File objects for OCR queue`);
  return event;
};

const createFixtureFolder = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'gps-folder-picker-'));
  const folder = path.join(root, 'GPS object 15');
  await mkdir(path.join(folder, 'nested'), { recursive: true });
  await writeFile(path.join(folder, 'photo10.jpg'), imageBytes);
  await writeFile(path.join(folder, 'photo2.jpg'), imageBytes);
  await writeFile(path.join(folder, 'nested', 'photo1.png'), imageBytes);
  await writeFile(path.join(folder, 'nested', 'notes.txt'), 'unsupported');
  await writeFile(path.join(folder, 'empty.jpg'), Buffer.alloc(0));
  return { root, folder };
};

const server = await createServer({
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
});
await server.listen();
const baseUrl = server.resolvedUrls.local[0];
const browser = await chromium.launch({ headless: true });
const fixture = await createFixtureFolder();

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];

const attachDiagnostics = async (page, extraInit = '') => {
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => failedRequests.push(`${request.method()} ${request.url()}`));
  await page.addInitScript(`
    window.__gpsImportEvents = [];
    window.__gpsImportTestSink = (event) => window.__gpsImportEvents.push(event);
    ${extraInit}
  `);
};

try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  await attachDiagnostics(page);
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await openUploadScreen(page);

  await visible(page.getByRole('button', { name: 'Выбрать фотографии', exact: true }), 'file picker button');
  await visible(page.getByRole('button', { name: 'Выбрать папку', exact: true }), 'folder picker button');

  await page.locator('input[aria-label="Выбрать фотографии для проверки"]').setInputFiles([
    path.join(fixture.folder, 'photo10.jpg'),
    path.join(fixture.folder, 'photo2.jpg'),
  ]);
  await assertImportEvent(page, 'files', 2);
  await visible(page.getByText('photo10.jpg').first(), 'ordinary selected file');
  await visible(page.getByText('photo2.jpg').first(), 'ordinary selected file 2');

  await page.locator('input[aria-label="Выбрать папку с фотографиями"]').setInputFiles(fixture.folder);
  const fallbackEvent = await assertImportEvent(page, 'folder', 3);
  assert.deepEqual(fallbackEvent.photos.map((photo) => photo.relativePath), [
    'GPS object 15/nested/photo1.png',
    'GPS object 15/photo2.jpg',
    'GPS object 15/photo10.jpg',
  ]);
  const fallbackSummary = await summaryText(page);
  assert.match(fallbackSummary, /Папка\s+GPS object 15/);
  assert.match(fallbackSummary, /Найдено файлов\s+5/);
  assert.match(fallbackSummary, /Добавлено фотографий\s+3/);
  assert.match(fallbackSummary, /Пропущено\s+2/);
  assert.match(fallbackSummary, /Вложенных папок\s+1/);
  assert.match(fallbackSummary, /неподдерживаемый формат\s+1/);
  assert.match(fallbackSummary, /пустой файл\s+1/);
  await visible(page.getByText('GPS object 15/nested/photo1.png'), 'nested relative path');
  assert.equal(await noHorizontalScroll(page), true, 'desktop horizontal scroll');
  await page.waitForFunction((key) => {
    const session = JSON.parse(localStorage.getItem(key) || 'null');
    return session?.name === 'GPS object 15'
      && session?.photos?.some((photo) => photo.relativePath === 'GPS object 15/nested/photo1.png');
  }, LAST_SESSION_KEY);
  const savedFolderSession = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), LAST_SESSION_KEY);
  assert.equal(savedFolderSession.name, 'GPS object 15');
  assert.ok(savedFolderSession.photos.every((photo) => !('stableFile' in photo) && !('sourceBuffer' in photo)));
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Восстановить' }).click();
  await visible(page.getByText('без доступа к локальной папке'), 'restored folder access notice');
  await visible(page.getByText('GPS object 15/nested/photo1.png'), 'restored relative path');
  await desktopNav(page, 'Результаты').click();
  await visible(page.getByRole('heading', { name: 'Сводка текущей проверки' }), 'results after folder restore');
  await desktopNav(page, 'Карта').click();
  await visible(page.getByRole('heading', { name: 'Точки и расстояния' }), 'map after folder restore');

  const adapterPage = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  await attachDiagnostics(adapterPage, `
    function fileHandle(name, type, size, lastModified) {
      return {
        kind: 'file',
        async getFile() {
          return new File([new Uint8Array(size || 4)], name, { type, lastModified: lastModified || 1 });
        },
      };
    }
    function directoryHandle(name, entries) {
      return {
        name,
        kind: 'directory',
        async *entries() {
          for (const entry of entries) yield entry;
        },
      };
    }
    window.__makeGpsDirectoryHandle = (count = 0) => directoryHandle('Mock GPS folder', count > 0
      ? Array.from({ length: count }, (_, index) => {
          const unsupported = index % 6 === 0;
          return [
            unsupported ? 'note' + index + '.txt' : 'photo' + index + '.jpg',
            fileHandle(
              unsupported ? 'note' + index + '.txt' : 'photo' + index + '.jpg',
              unsupported ? 'text/plain' : 'image/jpeg',
              4,
              index + 1,
            ),
          ];
        })
      : [
          ['photo10.jpg', fileHandle('photo10.jpg', 'image/jpeg', 4, 10)],
          ['photo2.jpg', fileHandle('photo2.jpg', 'image/jpeg', 4, 2)],
          ['nested', directoryHandle('nested', [
            ['photo1.webp', fileHandle('photo1.webp', 'image/webp', 4, 1)],
            ['fake.jpg', fileHandle('fake.jpg', 'application/pdf', 4, 3)],
          ])],
        ]);
    window.__gpsFolderPickerAdapter = {
      showDirectoryPicker: async () => window.__makeGpsDirectoryHandle(),
    };
    const originalArrayBuffer = File.prototype.arrayBuffer;
    window.__arrayBufferStats = { active: 0, max: 0 };
    File.prototype.arrayBuffer = async function patchedArrayBuffer() {
      window.__arrayBufferStats.active += 1;
      window.__arrayBufferStats.max = Math.max(window.__arrayBufferStats.max, window.__arrayBufferStats.active);
      try {
        await new Promise((resolve) => setTimeout(resolve, 2));
        return originalArrayBuffer.call(this);
      } finally {
        window.__arrayBufferStats.active -= 1;
      }
    };
  `);
  await adapterPage.goto(baseUrl, { waitUntil: 'networkidle' });
  await openUploadScreen(adapterPage);
  await adapterPage.getByRole('button', { name: 'Выбрать папку', exact: true }).click();
  const adapterEvent = await assertImportEvent(adapterPage, 'folder', 3);
  assert.deepEqual(adapterEvent.photos.map((photo) => photo.relativePath), [
    'Mock GPS folder/nested/photo1.webp',
    'Mock GPS folder/photo2.jpg',
    'Mock GPS folder/photo10.jpg',
  ]);
  const adapterSummary = await summaryText(adapterPage);
  assert.match(adapterSummary, /Найдено файлов\s+4/);
  assert.match(adapterSummary, /Добавлено фотографий\s+3/);
  assert.match(adapterSummary, /неподдерживаемый формат\s+1/);

  await adapterPage.evaluate(() => {
    window.__gpsImportEvents = [];
    window.__gpsFolderPickerAdapter = {
      showDirectoryPicker: async () => window.__makeGpsDirectoryHandle(300),
    };
  });
  await adapterPage.getByRole('button', { name: 'Выбрать папку', exact: true }).click();
  await assertImportEvent(adapterPage, 'folder', 20);
  const largeSummary = await summaryText(adapterPage);
  assert.match(largeSummary, /Найдено файлов\s+300/);
  assert.match(largeSummary, /Добавлено фотографий\s+20/);
  assert.match(largeSummary, /неподдерживаемый формат\s+50/);
  assert.match(largeSummary, /превышение существующего ограничения\s+230/);
  const maxArrayBufferConcurrency = await adapterPage.evaluate(() => window.__arrayBufferStats.max);
  assert.equal(maxArrayBufferConcurrency <= 2, true, 'folder buffering should be concurrency-limited');
  await adapterPage.locator('.sidebar-shell').getByRole('button', { name: 'Настройки' }).click();
  await visible(adapterPage.getByRole('heading', { name: 'Параметры проверки' }), 'settings after large import');

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 360, height: 800 },
  ]) {
    const mobile = await browser.newPage({ viewport });
    await attachDiagnostics(mobile);
    await mobile.goto(baseUrl, { waitUntil: 'networkidle' });
    await openUploadScreen(mobile);
    await visible(mobile.getByRole('button', { name: 'Выбрать фотографии', exact: true }), `${viewport.width}px file button`);
    await visible(mobile.getByRole('button', { name: 'Выбрать папку', exact: true }), `${viewport.width}px folder button`);
    await mobile.locator('input[aria-label="Выбрать папку с фотографиями"]').setInputFiles(fixture.folder);
    await assertImportEvent(mobile, 'folder', 3);
    await visible(mobile.locator('.folder-import-summary'), `${viewport.width}px folder summary`);
    assert.equal(await noHorizontalScroll(mobile), true, `${viewport.width}px horizontal scroll`);
    await mobile.close();
  }

  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(failedRequests, []);
} finally {
  await browser.close();
  await server.close();
  await rm(fixture.root, { recursive: true, force: true });
}

console.log('Folder picker browser tests passed');
