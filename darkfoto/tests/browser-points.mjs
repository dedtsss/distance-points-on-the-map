import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { handleNinjaboxRelay } from '../relay/worker.js';

const server = await createServer({ configFile: new URL('../vite.config.js', import.meta.url).pathname,
  root: new URL('..', import.meta.url).pathname, logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
const page = await context.newPage();
page.setDefaultTimeout(30000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
// Recognition has separate real-JPEG OCR coverage. Keep this UI flow deterministic.
await page.route('**/src/core/readPhoto.js', (route) => route.fulfill({ contentType: 'application/javascript', body: `
export async function readPhoto(file) {
  globalThis.__recognitions ||= []; globalThis.__recognitions.push(file.name);
  const n = Number(file.name.match(/source-(\\d+)/)[1]);
  return { coordinates: n === 12 ? null : { latitude: 64, longitude: 30 + (n <= 3 || n === 11 ? 0 : n === 13 ? .006 : n * .001) },
    coordinateQuality: 'confident', gpsSource: 'exif', gpsStatus: 'done',
    indexFromOcr: n === 12 ? null : n === 11 ? '6882' : String(6880 + n), indexStatus: n === 12 ? 'missing' : 'found', orientation: 1,
    accuracyMeters: n === 2 ? 1 : null,
    captureTimeMs: 1700000000000 + (n === 11 ? 4 : n) * 1000, captureTimeSource: 'exif' };
}` }));
await page.route('**/src/publishBatch.js', async (route) => {
  const response = await route.fetch();
  const body = (await response.text()).replace('export async function publishBatch(', 'async function originalPublishBatch(');
  await route.fulfill({ response, body: body + `
export async function publishBatch(rows, ids, options) {
  return originalPublishBatch(rows, ids, { ...options, onRows: async (updated) => {
    if (globalThis.__multipleLinks && updated[0].uploadResult?.links?.length && !updated[0].uploadResult.stale) {
      updated[0].uploadResult.links = [updated[0].uploadResult.links[0],
        {provider: 'fixture-provider', url: 'https://public.example/second?exact=1&x=2'}];
    }
    await options.onRows(updated);
  }});
}` });
});
const batches = [];
await page.route('https://*.workers.dev/v1/ninjabox', async (route) => {
  if (route.request().method() === 'OPTIONS') {
    await route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' } });
    return;
  }
  const request = new Request(route.request().url(), { method: 'POST', headers: route.request().headers(), body: route.request().postDataBuffer() });
  const response = await handleNinjaboxRelay(request, async (files) => {
    batches.push(files.map((file) => file.name));
    return { ok: true, galleryUrl: 'https://ninjabox.org/ed8ae0b8-9373-4dc0-a454-99e5f57a0578',
      items: files.map((_, index) => ({ url: `https://ninjabox.org/i/batch-${batches.length}-member-${index}` })) };
  });
  await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
});

const pointAct = async (point, name) => {
  await point.getByRole('button', { name: /Действия точки/ }).click();
  await page.locator('.point-action-sheet').getByRole('button', { name, exact: true }).click();
  await page.locator('.point-action-sheet').waitFor({ state: 'hidden' });
};

const openTxt = async () => {
  await page.evaluate(() => {
    window.__txtPresented = false;
    document.querySelector('.txt-modal').addEventListener('ionModalDidPresent', () => {
      window.__txtPresented = true;
    }, { once: true });
  });
  await page.getByRole('button', { name: 'Посмотреть', exact: true }).click();
  await page.waitForFunction(() => window.__txtPresented);
};

try {
  await page.goto(server.resolvedUrls.local[0]);
  await page.locator('ion-select').evaluate((element) => element.dispatchEvent(new CustomEvent('ionChange', { detail: { value: 'ninjabox' }, bubbles: true })));
  const buffer = await readFile(new URL('fixtures/representative-6300.jpg', import.meta.url));
  await page.locator('input[type=file]').first().setInputFiles(Array.from({ length: 10 }, (_, i) => ({ name: `source-${String(i + 1).padStart(2, '0')}.jpg`, mimeType: 'image/jpeg', buffer })));
  await page.getByRole('button', { name: 'Обработать фото', exact: true }).click();
  await page.getByRole('heading', { name: 'Проверка точек' }).waitFor();
  const cards = page.locator('.result-photo-card');
  assert.equal(await cards.count(), 8);
  assert.equal(await page.locator('.point-count').textContent(), '10 фото → 8 точек');
  assert.equal(await cards.first().locator('.photo-identity').textContent(), '#6882');
  assert.equal(await cards.first().locator('.photo-thumbnail').count(), 3);
  assert.equal(batches.length, 0, 'review must precede any publication');
  await pointAct(cards.first(), 'Разделить');
  assert.equal(await cards.count(), 10);
  assert.equal(await page.locator('ion-badge').filter({ hasText: 'Резерв' }).textContent(), 'Резерв 2');
  assert.deepEqual(await page.locator('.point-section-title').allTextContents(), ['Основные8', 'Резерв2']);
  assert.equal(await page.locator('.point-section-reserve .reserve-reasons').count(), 2);
  assert.match(await page.locator('.point-section-reserve .reserve-reasons').first().textContent(), /Конфликт: #6881 · 0\.0 м/);
  await pointAct(cards.first(), 'Со следующей #6882');
  assert.equal(await cards.count(), 9);
  const reserve6883 = cards.filter({ has: page.locator('.photo-identity', { hasText: '#6883' }) });
  await pointAct(reserve6883, 'С предыдущей #6882');
  assert.equal(await cards.count(), 8);
  assert.equal(await cards.first().locator('.photo-identity').textContent(), '#6882');
  assert.equal(await page.locator('ion-badge').filter({ hasText: 'Резерв' }).textContent(), 'Резерв 0');
  const initialOrder = await cards.locator('.photo-identity').allTextContents();
  const card = (identity) => cards.filter({ has: page.locator('.photo-identity', { hasText: identity }) });
  for (const identity of ['#6884', '#6886', '#6888']) {
    await pointAct(card(identity), 'Убрать');
    assert.equal(await cards.count(), 8);
    assert.deepEqual(await cards.locator('.photo-identity').allTextContents(), initialOrder);
  }
  assert.equal(await page.locator('.point-removed').count(), 3);
  assert.equal(await page.locator('.point-count').textContent(), '7 фото → 5 точек');
  for (const identity of ['#6884', '#6886', '#6888']) {
    const removed = card(identity);
    assert.equal(await removed.locator('.point-card-body').count(), 0);
    assert.equal(await removed.locator('.photo-state-removed').textContent(), 'Убрано');
    assert.equal(await removed.locator('.photo-coordinates').count(), 1);
    assert.equal(await removed.getByRole('button', { name: 'Вернуть', exact: true }).count(), 1);
    assert.equal(await removed.locator('header').evaluate((el) => getComputedStyle(el).boxShadow), 'none');
  }
  await openTxt();
  await page.locator('.txt-preview').waitFor();
  assert.doesNotMatch(await page.locator('.txt-preview').textContent(), /#688[468]/);
  assert.equal(await page.locator('.txt-preview').evaluate((el) => getComputedStyle(el).userSelect), 'text');
  // Select an arbitrary substring with pointer input, then use the normal browser copy command.
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
      .map((animation) => animation.finished.catch(() => {})));
  });
  const target = await page.locator('.txt-preview').evaluate((el) => {
    const node = el.firstChild;
    const start = node.textContent.indexOf('6882');
    const range = document.createRange(); range.setStart(node, start); range.setEnd(node, start + 4);
    const rect = range.getBoundingClientRect();
    return { x: rect.x, y: rect.y + rect.height / 2, width: rect.width };
  });
  await page.mouse.move(target.x, target.y);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width, target.y, { steps: 8 });
  await page.mouse.up();
  assert.equal(await page.evaluate(() => getSelection().toString()), '6882');
  await page.keyboard.press('Control+c');
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '6882');
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  const oneDownload = page.waitForEvent('download');
  await card('#6886').getByRole('button', { name: 'GPX', exact: true }).click();
  const oneFile = await oneDownload;
  const oneGpx = await readFile(await oneFile.path(), 'utf8');
  assert.equal((oneGpx.match(/<wpt /g) || []).length, 1);
  assert.match(oneGpx, /#6886/);
  const aggregateDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Экспорт', exact: true }).click();
  const aggregateFile = await aggregateDownload;
  const aggregate = await readFile(await aggregateFile.path(), 'utf8');
  assert.equal((aggregate.match(/<wpt /g) || []).length, 5);
  assert.doesNotMatch(aggregate, /#688[468]/);
  for (const width of [320, 375, 812]) {
    await page.setViewportSize({ width, height: width === 812 ? 375 : 812 });
    await card('#6886').scrollIntoViewIfNeeded();
    const header = await card('#6886').locator('header').boundingBox();
    assert.ok(header.x >= 0 && header.x + header.width <= width);
    assert.equal(await card('#6886').locator('.point-header-actions').evaluate((el) => el.scrollWidth <= el.clientWidth), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }
  await page.setViewportSize({ width: 375, height: 812 });
  for (const identity of ['#6888', '#6884', '#6886']) {
    await card(identity).getByRole('button', { name: 'Вернуть', exact: true }).click();
    assert.deepEqual(await cards.locator('.photo-identity').allTextContents(), initialOrder);
  }
  assert.equal(await page.locator('.point-removed').count(), 0);
  assert.equal(await page.locator('.point-count').textContent(), '10 фото → 8 точек');
  await openTxt();
  await page.locator('.txt-preview').waitFor();
  assert.match(await page.locator('.txt-preview').textContent(), /#6884/);
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  // Publish with an excluded row still present in its slot.
  await pointAct(card('#6886'), 'Убрать');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await card('#6886').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/darkfoto-039-review.png', fullPage: true });
  await page.getByRole('button', { name: 'Опубликовать 7 точек', exact: true }).click();
  await page.getByRole('heading', { name: 'Результат', exact: true }).waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.point-link')].length === 7);
  assert.equal(batches.length, 7);
  assert.deepEqual(batches[0], ['6882-01.jpg', '6882-02.jpg', '6882-03.jpg']);
  assert.equal(await cards.first().getByRole('link').getAttribute('href'), 'https://ninjabox.org/ed8ae0b8-9373-4dc0-a454-99e5f57a0578');
  assert.equal(await cards.locator('.point-link').count(), 7);
  assert.equal(await page.locator('.point-actions').count(), 0);
  assert.equal(await page.locator('.point-removed').count(), 1);
  await cards.first().locator('.photo-thumbnail').nth(1).click();
  await page.locator('.image-gesture-area img').waitFor();
  await page.getByRole('button', { name: 'Увеличить' }).click();
  assert.match(await page.locator('.image-gesture-area img').getAttribute('style'), /scale\(1.5\)/);
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await openTxt();
  await page.locator('.txt-preview').waitFor();
  const txt = await page.locator('.txt-preview').textContent();
  assert.equal((txt.match(/^#/gm) || []).length, 7);
  assert.equal((txt.match(/ed8ae0b8/g) || []).length, 1);
  await page.locator('.txt-modal-content').evaluate((element) => element.scrollToBottom(0));
  await page.waitForFunction(() => {
    const rect = document.querySelector('.txt-actions')?.getBoundingClientRect();
    return rect && rect.top >= 0 && rect.bottom <= window.innerHeight + 1;
  });
  const footer = await page.locator('.txt-actions').boundingBox();
  assert.ok(footer.y >= 0 && footer.y + footer.height <= 813);
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.setViewportSize({ width: 812, height: 375 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  assert.equal(await cards.count(), 8);
  await card('#6886').getByRole('button', { name: 'Вернуть', exact: true }).click();
  assert.equal(await page.locator('.point-count').textContent(), '10 фото → 8 точек');
  await page.getByRole('button', { name: 'Продолжить публикацию', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.point-link').length === 8);
  assert.equal(batches.length, 8, 'restoring after publication publishes only the restored point');
  assert.deepEqual(batches[7], ['6886.jpg']);
  assert.deepEqual(await cards.locator('.photo-identity').allTextContents(), initialOrder);
  // Correct only one member after publication, preserving logical identities.
  const sourceId = await cards.first().getAttribute('data-point-id');
  const targetId = await card('#6884').getAttribute('data-point-id');
  const source = () => page.locator(`[data-point-id="${sourceId}"]`);
  const targetPoint = () => page.locator(`[data-point-id="${targetId}"]`);
  const act = async (point, memberId, name) => {
    await point.locator(`[data-member-id="${memberId}"]`).getByRole('button', { name: /Действия фото/ }).click();
    await page.locator('.photo-action-sheet').getByRole('button', { name, exact: true }).click();
    await page.locator('.photo-action-sheet').waitFor({ state: 'hidden' });
  };
  await act(source(), '3', 'Переместить');
  await page.locator('.move-photo-modal ion-searchbar input').fill('6884');
  await page.locator('.move-photo-modal ion-item').filter({ hasText: '#6884' }).click();
  await page.locator('.move-photo-modal').waitFor({ state: 'hidden' });
  assert.equal(await source().locator('.photo-thumbnail').count(), 2);
  assert.equal(await targetPoint().locator('.photo-thumbnail').count(), 2);
  assert.equal(await cards.count(), 8);
  assert.equal(await page.locator('.point-link').count(), 6);
  assert.equal(batches.length, 8);
  await pointAct(source(), 'Копировать блок');
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /Фото: ссылка отсутствует/);
  await page.evaluate(() => { globalThis.__multipleLinks = true; });
  await page.getByRole('button', { name: 'Продолжить публикацию', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.point-link').length === 9);
  assert.equal(batches.length, 10, 'only two affected points are republished');
  assert.deepEqual(batches[8], ['6882-01.jpg', '6882-02.jpg']);
  assert.deepEqual(batches[9], ['6883-01.jpg', '6883-02.jpg']);
  const links = source().locator('.point-link');
  assert.equal(await links.count(), 2, 'multi-provider fixture is rendered');
  for (const link of await links.all()) {
    const open = link.getByRole('link', { name: 'Открыть', exact: true });
    const url = await open.getAttribute('href');
    assert.equal(await open.getAttribute('target'), '_blank');
    assert.equal(await open.getAttribute('rel'), 'noreferrer');
    await link.getByRole('button', { name: 'Копировать', exact: true }).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), url);
  }
  assert.match(await links.nth(1).textContent(), /fixture-provider/);
  await act(source(), '2', 'Убрать фото');
  assert.equal(await source().locator('.photo-identity').textContent(), '#6881');
  assert.equal(await source().locator('.photo-thumbnail').count(), 1);
  assert.equal(await source().locator('.point-link').count(), 0);
  await source().getByRole('button', { name: /Вернуть фото точки/ }).click();
  assert.equal(await source().locator('.photo-identity').textContent(), '#6882');
  assert.equal(await source().locator('.point-link').count(), 0, 'restore invalidates publication instead of reviving obsolete URLs');
  await act(card('#6886'), '6', 'Убрать фото');
  assert.equal(await card('#6886').locator('.point-card-body').count(), 0);
  const beforeAppend = await page.evaluate(() => globalThis.__recognitions.slice());
  const appendChooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Добавить фото', exact: true }).click();
  await (await appendChooser).setFiles([11, 12, 13].map((n) => ({ name: `source-${n}.jpg`, mimeType: 'image/jpeg', buffer })));
  await page.getByText('Добавлено 3 фото. Проверьте точки перед публикацией.', { exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => globalThis.__recognitions), [...beforeAppend, 'source-11.jpg', 'source-12.jpg', 'source-13.jpg']);
  assert.equal(await source().locator('.photo-thumbnail').count(), 3, 'strong evidence attaches to existing source');
  assert.equal(await card('#6886').locator('.photo-state-removed').count(), 1, 'removed placeholder retained');
  assert.equal(await cards.count(), 10, 'unknown and photo near removed point create new entities');
  assert.equal(batches.length, 10, 'append does not auto-upload');
  assert.equal(await targetPoint().locator('.photo-thumbnail').count(), 2, 'manual membership remains intact');
  const unknown = cards.filter({ has: page.locator('[data-member-id="12"]') });
  await act(unknown, '12', 'Переместить');
  for (const width of [320, 375, 812]) {
    await page.setViewportSize({ width, height: width === 812 ? 375 : 812 });
    await page.locator('.move-photo-modal ion-searchbar input').fill('6883');
    const bounds = await page.locator('.move-photo-modal ion-content').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.locator('.move-photo-modal ion-content').evaluate((el) => el.scrollWidth <= el.clientWidth), true);
  }
  await page.screenshot({ path: '/tmp/darkfoto-040-move.png' });
  await page.locator('.move-photo-modal ion-item').filter({ hasText: '#6883' }).click();
  await page.locator('.move-photo-modal').waitFor({ state: 'hidden' });
  assert.equal(await targetPoint().locator('.photo-thumbnail').count(), 3, 'manual move accepts no-GPS/no-index photo');
  assert.equal(await page.locator('[data-point-id="12"] .photo-state-removed').count(), 1);
  await page.getByRole('button', { name: 'Опубликовать 3 точек', exact: true }).click();
  await page.getByText('Обработка завершена.', { exact: true }).waitFor();
  assert.equal(batches.length, 13, 'only two dirty points and one new active point upload');
  assert.deepEqual(batches[10], ['6882-01.jpg', '6882-02.jpg', '6882-03.jpg']);
  assert.deepEqual(batches[11], ['6883-01.jpg', '6883-02.jpg', '6883-03.jpg']);
  assert.deepEqual(batches[12], ['6893.jpg']);
  await page.locator('[data-point-id="12"]').getByRole('button', { name: 'Вернуть', exact: true }).click();
  assert.equal(await targetPoint().locator('.photo-thumbnail').count(), 2, 'empty moved source recovers its photo');
  assert.equal(await page.locator('[data-point-id="12"] .photo-thumbnail').count(), 1);
  console.log('0.4.0 mobile membership: stable 1+3→2+2 identities, dirty-point retry, representative removal/undo, append-only recognition, removed placeholders, no-GPS move, universal exact URL copy, searchable chooser at 320/375/812px: PASS');
  assert.deepEqual(errors, []);
  console.log('375×812 / landscape: review 10→8, split/merge, no early uploads, 7 active sanitized POSTs/links, independent removals/stable slots, one-point/aggregate GPX, TXT substring selection/copy and footer: PASS');
} catch (error) {
  console.error(error);
  console.error(await page.locator('body').innerText());
  await page.screenshot({ path: '/tmp/darkfoto-040-failed.png', fullPage: true });
  throw error;
} finally {
  await browser.close();
  server.httpServer.closeAllConnections();
  await server.close();
}
