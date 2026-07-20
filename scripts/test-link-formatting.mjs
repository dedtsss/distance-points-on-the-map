import assert from 'node:assert/strict';
import { formatAllLinks, photoLinksInRequestedOrder } from '../src/features/links/linkFormatter.js';
import { formatIndexCoordinateRows } from '../src/features/points/indexCoordinateFormatter.js';

const photo = (number, provider = 'ninjabox') => ({
  number,
  indexFromOcr: String(6368 + number),
  coordinates: { latitude: 64.607 + (number / 1_000_000), longitude: 30.622 + (number / 1_000_000) },
  uploadResult: {
    providerOrder: ['ninjabox', 'freeimage', 'x0'],
    selectedProvider: provider,
    links: [{ provider, url: `https://${provider}.test/${number}` }],
  },
});

const fivePhotos = Array.from({ length: 5 }, (_, index) => photo(index + 1));
const formatted = formatAllLinks(fivePhotos);
const lines = formatted.split('\n');
assert.equal(lines.filter(Boolean).length, 5);
assert.equal(lines.filter((line) => line === '').length, 4);
assert.deepEqual(lines.slice(0, 3), ['https://ninjabox.test/1', '', 'https://ninjabox.test/2']);
assert.ok(lines.every((line) => line === '' || /^https:\/\//.test(line)));

const fallbackPhoto = photo(1, 'freeimage');
assert.deepEqual(photoLinksInRequestedOrder(fallbackPhoto), ['https://freeimage.test/1']);

const legacyMultiLinkPhoto = {
  uploadResult: {
    requestedProviders: ['freeimage', 'ninjabox'],
    links: [
      { provider: 'ninjabox', url: 'https://ninja.test/legacy' },
      { provider: 'freeimage', url: 'https://free.test/legacy' },
    ],
  },
};
assert.deepEqual(photoLinksInRequestedOrder(legacyMultiLinkPhoto), [
  'https://free.test/legacy',
  'https://ninja.test/legacy',
]);

const copiedRows = formatIndexCoordinateRows([
  {
    number: 2,
    indexFromOcr: '',
    coordinates: null,
  },
  {
    number: 1,
    indexFromOcr: '6369',
    coordinates: { latitude: 64.607016, longitude: 30.62284 },
    coordinateText: { latitude: '64.607016', longitude: '30.622840' },
  },
]);
assert.equal(copiedRows, [
  'Фото 1 | 6369 | 64.607016, 30.622840',
  'Фото 2 | индекс не распознан | координаты не найдены',
].join('\n'));

console.log('Link and index-coordinate formatting tests passed');
