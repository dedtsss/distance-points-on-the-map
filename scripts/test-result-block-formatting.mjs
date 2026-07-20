import assert from 'node:assert/strict';
import {
  EXPORT_DESCRIPTION_KEY,
  SESSION_COLOR_KEY,
  loadExportDescription,
  loadSessionColor,
  photoSessionSignature,
  saveExportDescription,
  saveSessionColor,
} from '../src/features/export/exportPreferences.js';
import {
  buildPhotoResultBlocks,
  formatAllPhotoResultBlocks,
  formatPhotoResultBlock,
} from '../src/features/export/resultBlockFormatter.js';

const values = new Map();
const storage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key),
};

assert.equal(saveExportDescription('Объект № 7\r\nСеверная сторона', storage), 'Объект № 7\nСеверная сторона');
assert.equal(loadExportDescription(storage), 'Объект № 7\nСеверная сторона');
assert.equal(values.has(EXPORT_DESCRIPTION_KEY), true);
saveExportDescription('', storage);
assert.equal(values.has(EXPORT_DESCRIPTION_KEY), false);

const photos = [{
  id: 'photo-a',
  number: 1,
  indexFromOcr: '6369',
  coordinates: { latitude: 64.607016, longitude: 30.62284 },
  uploadResult: {
    providerOrder: ['ninjabox', 'freeimage', 'x0'],
    links: [{ provider: 'ninjabox', url: 'https://ninjabox.org/i/example' }],
  },
}, {
  id: 'photo-b',
  number: 2,
  indexFromOcr: null,
  coordinates: null,
  uploadResult: null,
}];

const signature = photoSessionSignature(photos);
assert.equal(signature, 'photo-a|photo-b');
assert.equal(saveSessionColor(signature, '  Красный  ', storage), 'Красный');
assert.equal(loadSessionColor(signature, storage), 'Красный');
assert.equal(loadSessionColor('photo-b|photo-a', storage), 'Красный');
assert.equal(loadSessionColor('photo-b', storage), 'Красный');
assert.equal(loadSessionColor('another-session', storage), '');
assert.equal(values.has(SESSION_COLOR_KEY), true);

const first = formatPhotoResultBlock(photos[0], {
  description: 'Опора линии\nУчасток 4',
  color: 'Красный',
});
assert.equal(first, [
  'Опора линии',
  'Участок 4',
  '',
  'Цвет: Красный',
  'Индекс: 6369',
  'Координаты: 64.607016, 30.62284',
  'Фото: https://ninjabox.org/i/example',
].join('\n'));

const second = formatPhotoResultBlock(photos[1], { description: '', color: '' });
assert.match(second, /^Цвет: не указан/m);
assert.match(second, /^Индекс: не распознан/m);
assert.match(second, /^Координаты: не найдены/m);
assert.match(second, /^Фото: ссылка отсутствует/m);

const blocks = buildPhotoResultBlocks(photos, { description: 'Тест', color: 'Синий' });
assert.equal(blocks.length, 2);
assert.equal(blocks[0].photoId, 'photo-a');
assert.equal(blocks[1].photoNumber, 2);
const all = formatAllPhotoResultBlocks(photos, { description: 'Тест', color: 'Синий' });
assert.equal(all.split('\n\n').length >= 2, true);
assert.equal((all.match(/Цвет: Синий/g) || []).length, 2);
assert.equal((all.match(/Тест/g) || []).length, 2);

console.log('Result block formatting tests passed');
