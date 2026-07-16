import assert from 'node:assert/strict';
import { formatAllLinks, photoLinksInRequestedOrder } from '../src/features/links/linkFormatter.js';

const settings = { freeimage: true, ninjabox: true, includeX0: false, fallbackX0: true };
const photo = (number) => ({
  number,
  uploadResult: {
    requestedProviders: ['freeimage', 'ninjabox'],
    includeX0: false,
    fallback: 'x0',
    links: [
      { provider: 'freeimage', url: `https://free.test/${number}` },
      { provider: 'ninjabox', url: `https://ninja.test/${number}` },
    ],
  },
});

const fivePhotos = Array.from({ length: 5 }, (_, index) => photo(index + 1));
const formatted = formatAllLinks(fivePhotos, settings);
const lines = formatted.split('\n');
assert.equal(lines.filter(Boolean).length, 10);
assert.equal(lines.filter((line) => line === '').length, 4);
assert.deepEqual(lines.slice(0, 3), ['https://free.test/1', 'https://ninja.test/1', '']);
assert.ok(lines.every((line) => line === '' || /^https:\/\//.test(line)));
assert.equal(/Freeimage|Ninjabox|Фото/.test(formatted), false);

const fallbackPhoto = {
  uploadResult: {
    requestedProviders: ['freeimage', 'ninjabox'],
    includeX0: false,
    fallback: 'x0',
    links: [
      { provider: 'ninjabox', url: 'https://ninja.test/fallback' },
      { provider: 'x0', url: 'https://x0.test/fallback', replaces: ['freeimage'] },
    ],
  },
};
assert.deepEqual(photoLinksInRequestedOrder(fallbackPhoto, settings), [
  'https://x0.test/fallback',
  'https://ninja.test/fallback',
]);

const requiredX0Settings = { ...settings, includeX0: true };
const requiredX0Photo = photo(1);
requiredX0Photo.uploadResult.includeX0 = true;
requiredX0Photo.uploadResult.links.push({ provider: 'x0', url: 'https://x0.test/required' });
assert.deepEqual(photoLinksInRequestedOrder(requiredX0Photo, requiredX0Settings), [
  'https://free.test/1',
  'https://ninja.test/1',
  'https://x0.test/required',
]);

console.log('Link formatting tests passed');
