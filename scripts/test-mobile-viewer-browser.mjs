import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const pngBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZVb0AAAAASUVORK5CYII=',
  'base64',
);

const root = await mkdtemp(path.join(os.tmpdir(), 'gps-mobile-viewer-'));
const photoPath = path.join(root, 'viewer-photo.png');
await writeFile(photoPath, pngBytes);

const server = await createServer({
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
});
await server.listen();
const baseUrl = server.resolvedUrls.local[0];
const browser = await chromium.launch({ headless: true });
// Mobile CSS is selected by viewport width. Keep desktop pointer input so the
// drag smoke uses Chromium's normal Pointer Events path without touch emulation conflicts.
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.route('**/api/sessions*', (route) => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ ok: true, sessions: [], nextSessionNumber: 1, dashboard: {} }),
}));
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Открыть меню' }).click();
  await page.locator('.ant-drawer-content').getByRole('menuitem', { name: 'Сессия' }).click();
  await page.locator('input[aria-label="Выбрать фотографии для проверки"]').setInputFiles(photoPath);

  const openButton = page.getByRole('button', { name: 'Открыть фотографию 1 в просмотрщике' });
  await openButton.waitFor({ state: 'visible' });
  await openButton.click();

  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ state: 'visible' });
  const dialogBox = await page.locator('.photo-viewer-dialog').boundingBox();
  assert.ok(dialogBox, 'viewer dialog should have a bounding box');
  assert.ok(dialogBox.width >= 388, `viewer should fill mobile width, got ${dialogBox.width}`);
  assert.ok(dialogBox.height >= 800, `viewer should fill mobile height, got ${dialogBox.height}`);

  const zoomOutput = page.locator('.photo-viewer-zoom-controls output');
  assert.equal(await zoomOutput.textContent(), '100%');
  await page.getByRole('button', { name: 'Увеличить' }).click();
  assert.equal(await zoomOutput.textContent(), '125%');

  const stage = page.locator('.photo-viewer-stage');
  const image = page.locator('.photo-viewer-image');
  const box = await stage.boundingBox();
  assert.ok(box, 'viewer stage should have a bounding box');
  const beforeTransform = await image.getAttribute('style');
  await page.mouse.move(box.x + (box.width / 2), box.y + (box.height / 2));
  await page.mouse.down();
  await page.mouse.move(box.x + (box.width / 2) + 58, box.y + (box.height / 2) + 36, { steps: 5 });
  await page.mouse.up();

  const movedTransform = await image.getAttribute('style');
  assert.notEqual(movedTransform, beforeTransform, 'drag should change the image transform');
  assert.doesNotMatch(movedTransform || '', /translate3d\(0px, 0px, 0px?\)/);
  await page.waitForTimeout(350);
  assert.equal(await image.getAttribute('style'), movedTransform, 'image must not return to center after drag');

  await page.getByRole('button', { name: 'Вписать' }).click();
  assert.equal(await zoomOutput.textContent(), '100%');
  assert.match(await image.getAttribute('style') || '', /translate3d\(0px, 0px, 0(px)?\) scale\(1\)/);

  await page.getByRole('button', { name: 'Закрыть просмотр фотографии' }).click();
  await dialog.waitFor({ state: 'detached' });
  assert.deepEqual(pageErrors, []);
} finally {
  await browser.close();
  await server.close();
  await rm(root, { recursive: true, force: true });
}

console.log('Mobile photo viewer browser smoke passed.');
