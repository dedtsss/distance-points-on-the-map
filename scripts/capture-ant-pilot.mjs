import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const output = new URL('../docs/pr-45-ant-design-pilot/screenshots/', import.meta.url);
const screenshotPath = (name) => fileURLToPath(new URL(name, output));
const baseSession = (stage) => ({
  schemaVersion: 2, sessionId: `capture-${stage}`, sessionNumber: 45, title: 'Ant pilot capture', name: 'Ant pilot capture', color: 'Синий', packing: '10 шт.', description: 'Browser evidence', status: 'attention', stage,
  thresholdMeters: 25, providerSettings: { ninjabox: true, fallbackFreeimage: true, fallbackX0: true }, processingSettings: { metadataCleanup: true, renameFiles: true, metadataFirst: true }, regionMode: 'auto', mapLayerId: 'osm', createdAt: '2026-08-13T18:00:00.000Z', updatedAt: '2026-08-13T18:00:00.000Z',
  photos: [{ photoId: 'capture-photo', number: 1, fileName: 'capture.jpg', indexFromOcr: '0045', indexStatus: 'found', coordinates: { latitude: 64.1, longitude: 30.1 }, gpsSource: 'manual', gpsStatus: 'done', coordinateQuality: 'manual', ocrStatus: 'done', status: stage === 'result' ? 'uploaded' : 'distance_ready', cleanupStatus: stage === 'select' ? 'idle' : 'done', uploadStatus: stage === 'result' ? 'done' : 'idle', workStatus: 'active', disposition: 'active', uploadResult: { links: [{ provider: 'ninjabox', url: 'https://example.test/capture' }] } }],
});

const server = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true });
await mkdir(output, { recursive: true });

try {
  for (const viewport of [{ width: 1440, height: 1000, name: 'desktop' }, { width: 360, height: 800, name: 'mobile-360' }, { width: 390, height: 844, name: 'mobile-390' }, { width: 412, height: 915, name: 'mobile-412' }]) {
    for (const stage of ['select', 'recognition', 'review', 'result']) {
      const page = await browser.newPage({ viewport });
      await page.route('**/api/sessions*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, sessions: [baseSession(stage)], nextSessionNumber: 46, dashboard: {} }) }));
      await page.addInitScript((session) => localStorage.setItem('dark-cat-crm-sessions-v1', JSON.stringify({ schemaVersion: 2, nextSessionNumber: 46, sessions: [session] })), baseSession(stage));
      await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
      if (stage === 'select') {
        if (viewport.width < 861) { await page.getByRole('button', { name: 'Открыть меню' }).click(); await page.locator('.ant-drawer-content').getByRole('menuitem', { name: 'Сессия' }).click(); }
        else await page.getByRole('menuitem', { name: 'Сессия' }).click();
      } else {
        if (viewport.width < 861) { await page.getByRole('button', { name: 'Открыть меню' }).click(); await page.locator('.ant-drawer-content').getByRole('menuitem', { name: 'История' }).click(); }
        else await page.getByRole('menuitem', { name: 'История' }).click();
        await page.getByRole('button', { name: 'Открыть', exact: true }).click();
      }
      await page.screenshot({ path: screenshotPath(`${viewport.name}-session-${stage}.png`), fullPage: true });
      if (stage === 'select') {
        await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
        await page.screenshot({ path: screenshotPath(`${viewport.name}-overview.png`), fullPage: true });
        if (viewport.width < 861) { await page.getByRole('button', { name: 'Открыть меню' }).click(); await page.screenshot({ path: screenshotPath(`${viewport.name}-navigation.png`), fullPage: true }); await page.locator('.ant-drawer-content').getByRole('menuitem', { name: 'История' }).click(); }
        else await page.getByRole('menuitem', { name: 'История' }).click();
        await page.screenshot({ path: screenshotPath(`${viewport.name}-history.png`), fullPage: true });
        if (viewport.width < 861) { await page.getByRole('button', { name: 'Открыть меню' }).click(); await page.locator('.ant-drawer-content').getByRole('menuitem', { name: 'Карта' }).click(); }
        else await page.getByRole('menuitem', { name: 'Карта' }).click();
        await page.screenshot({ path: screenshotPath(`${viewport.name}-map.png`), fullPage: true });
      }
      await page.close();
    }
  }
} finally { await browser.close(); await server.close(); }

console.log('Ant Design pilot screenshots captured.');
