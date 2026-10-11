import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ configFile: new URL('../vite.config.js', import.meta.url).pathname,
  root: new URL('..', import.meta.url).pathname, logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const labels = ['Сессия', 'Цвет', 'Фасовка', 'Комментарий'];
const fields = ['session', 'color', 'packing', 'comment'];
// A native recovery bridge with a material 0.5.0 job. Web pickers let us also
// test the browser's File objects: reset must leave the originals readable.
await page.route('**/src/androidFolder.js', (route) => route.fulfill({ contentType: 'application/javascript', body: `
export const hasAndroidFolderPicker = () => false;
export const pickAndroidFolder = async () => [];
export const pickAndroidPhotos = async () => [];
export const readAndroidPhoto = async () => { throw new Error('Old photos must not be read'); };
export const saveAndroidRecovery = async () => { throw new Error('Jobs must not be persisted'); };
export const loadAndroidRecovery = async () => {
  globalThis.__loads = (globalThis.__loads || 0) + 1;
  return { files: [{id:'old',name:'old.jpg',native:true}], rows: [{id:'old',number:1}],
    publisher:'ninjabox', phase:'publishing', session:'old', color:'old', packing:'old', comment:'old' };
};
export const clearAndroidRecovery = async () => { globalThis.__clears = (globalThis.__clears || 0) + 1; };
` }));
await page.route('**/src/core/readPhoto.js', (route) => route.fulfill({ contentType: 'application/javascript', body: `
export async function readPhoto() {
  return {coordinates:{latitude:64,longitude:30},coordinateQuality:'confident',gpsSource:'exif',
    indexFromOcr:'7001',indexStatus:'found',orientation:1};
}` }));
const input = (label) => page.getByRole('combobox', { name: label, exact: true });
const empty = async () => {
  await page.getByText('Выбрано: 0', { exact: true }).waitFor();
  assert.equal(await page.locator('.result-photo-card, .point-count, .progress-area, .point-link').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Обработать фото', exact: true }).isDisabled(), true);
  for (const label of labels) assert.equal(await input(label).inputValue(), '');
  assert.equal(await page.evaluate(() => globalThis.__loads || 0), 0, 'never load old native jobs');
  assert.equal(await page.locator('.darkfoto-layout ion-text [role=status]').textContent(), '');
};
const stored = () => page.evaluate((keys) => keys.map((field) => localStorage.getItem(`darkcat-photo.recent.${field}`)), fields);
try {
  await page.goto(server.resolvedUrls.local[0]);
  await page.evaluate(async (fields) => {
    const { rememberValue } = await import('/src/recentValues.js');
    for (const field of fields) for (let n = 1; n <= 12; n++) rememberValue(field, `${field} ${n}`);
  }, fields);
  await page.reload();
  await empty();
  await page.waitForFunction(() => globalThis.__clears === 1);
  for (const [index, label] of labels.entries()) {
    await input(label).focus();
    const options = page.getByRole('listbox', { name: `Подсказки: ${label}`, exact: true }).getByRole('option');
    assert.equal(await options.count(), 10);
    assert.equal(await options.first().textContent(), `${fields[index]} 12`);
    await options.first().click();
    assert.equal(await input(label).inputValue(), `${fields[index]} 12`);
    await input(label).fill(`${fields[index]} edited`);
    await page.getByRole('heading', { name: 'Фотографии', exact: true }).click();
  }
  const buffer = await readFile(new URL('fixtures/representative-6300.jpg', import.meta.url));
  const picker = page.locator('input[type=file]').first();
  await picker.setInputFiles([{ name: 'source-original.jpg', mimeType: 'image/jpeg', buffer }]);
  await picker.evaluate((element) => { globalThis.__original = element.files[0]; });
  await page.getByRole('button', { name: 'Обработать фото', exact: true }).click();
  await page.getByRole('heading', { name: 'Проверка точек' }).waitFor();
  const recent = await stored();
  await page.getByRole('button', { name: 'Начать заново', exact: true }).click();
  const alert = page.locator('.reset-work-alert');
  await alert.getByRole('button', { name: 'Отмена', exact: true }).click();
  await alert.waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.result-photo-card').count(), 1);
  assert.equal(await input('Сессия').inputValue(), 'session edited');
  await page.getByRole('button', { name: 'Начать заново', exact: true }).click();
  await alert.getByRole('button', { name: 'Очистить', exact: true }).click();
  await alert.waitFor({ state: 'hidden' });
  await empty();
  assert.equal(await picker.evaluate((element) => element.files.length), 0);
  assert.deepEqual(await stored(), recent, 'reset retains all MRUs byte for byte');
  assert.deepEqual(await page.evaluate(async () => ({ name: globalThis.__original.name,
    bytes: (await globalThis.__original.arrayBuffer()).byteLength })), { name: 'source-original.jpg', bytes: buffer.length });
  await page.getByRole('button', { name: 'Начать заново', exact: true }).click();
  assert.equal(await alert.isVisible(), false, 'empty job needs no confirmation');
  // Fields alone also count as material work, without any selected files.
  await input('Комментарий').fill('field-only work');
  await page.getByRole('button', { name: 'Начать заново', exact: true }).click();
  await alert.getByRole('button', { name: 'Отмена', exact: true }).click();
  await alert.waitFor({ state: 'hidden' });
  assert.equal(await input('Комментарий').inputValue(), 'field-only work');
  await page.reload();
  await empty();
  await input('Сессия').focus();
  assert.equal(await page.getByRole('listbox', { name: 'Подсказки: Сессия', exact: true }).getByRole('option').first().textContent(), 'session edited');
  await page.getByRole('heading', { name: 'Фотографии', exact: true }).click();
  for (const [width, height] of [[320, 812], [375, 812], [812, 320], [812, 375]]) {
    await page.setViewportSize({ width, height });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }
  await mkdir('/tmp/darkcat-051', { recursive: true });
  await page.setViewportSize({ width: 320, height: 812 });
  await page.screenshot({ path: '/tmp/darkcat-051/empty-320.png' });
  await page.locator('ion-segment-button').nth(1).click();
  await page.getByText(/нет активных точек с координатами/).waitFor();
  assert.equal(await page.locator('.session-map-marker, .map-preview').count(), 0);
  assert.deepEqual(errors, []);
  console.log('0.5.1 job lifecycle: cold native recovery ignored; zero photos/points/fields/progress; persistent 10-value MRUs; cancel/confirm/field-only/empty reset; originals readable; map empty; 320/375 portrait+landscape: PASS');
} finally {
  await browser.close(); server.httpServer.closeAllConnections(); await server.close();
}
