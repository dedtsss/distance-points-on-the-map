import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupPhotos, makePoint, splitPoint, mergePoint } from '../src/core/photoPoints.js';
import { captureTime, parseAccuracy } from '../src/core/captureTime.js';
import { readPhoto } from '../src/core/readPhoto.js';
import { splitBatch } from '../src/core/batch.js';

export const photo = (number, meters = 0, seconds = number, extra = {}) => ({
  id: String(number), number, fileName: `source-${number}.jpg`,
  coordinates: { latitude: 64, longitude: 30 + meters * 180 / (Math.PI * 6371000 * Math.cos(64 * Math.PI / 180)) },
  coordinateQuality: 'confident', gpsSource: 'exif', gpsStatus: 'done',
  indexFromOcr: String(6880 + number), indexStatus: 'found',
  captureTimeMs: 1_700_000_000_000 + seconds * 1000, captureTimeSource: 'exif',
  uploadResult: { links: [] }, ...extra,
});

test('deterministic grouping uses space, time and neighboring index evidence', () => {
  const rows = [photo(1), photo(2, 8), photo(3, 40)];
  assert.deepEqual(groupPhotos(rows).map((point) => point.members.map((member) => member.id)), [['1', '2'], ['3']]);
  assert.deepEqual(groupPhotos([...rows].reverse()), groupPhotos(rows));
  assert.equal(groupPhotos([photo(1), photo(2, 8, 10, { indexFromOcr: '8000' })]).length, 2);
  assert.equal(groupPhotos([photo(1), photo(2, 2, 10, { indexFromOcr: null, indexStatus: 'missing' })]).length, 1);
  assert.equal(groupPhotos([photo(1), photo(2, 8, 10, { indexFromOcr: null, indexStatus: 'missing' })]).length, 2);
});

test('fixed anchor and total time span prevent transitive spatial/time drift', () => {
  assert.deepEqual(groupPhotos([photo(1, 0, 0), photo(2, 8, 50), photo(3, 16, 100)])
    .map((point) => point.members.length), [2, 1]);
  assert.deepEqual(groupPhotos([photo(1, 0, 0), photo(2, 0, 100), photo(3, 0, 200)])
    .map((point) => point.members.length), [2, 1]);
  assert.equal(groupPhotos([photo(1, 0, 0), photo(2, 0, 120)]).length, 1);
  assert.equal(groupPhotos([photo(1, 0, 0), photo(2, 0, 121)]).length, 2);
});

test('weak mtime alone never merges; missing time needs tight space and continuous indexes', () => {
  const weak = (n, m, extra = {}) => photo(n, m, 0, { captureTimeSource: 'lastModified', ...extra });
  assert.equal(groupPhotos([weak(1, 0, { indexFromOcr: null }), weak(2, 0, { indexFromOcr: null })]).length, 2);
  assert.equal(groupPhotos([weak(1, 0), weak(2, 8)]).length, 2);
  assert.equal(groupPhotos([weak(1, 0), weak(2, 2)]).length, 1);
  assert.equal(groupPhotos([photo(1), photo(2, 0, 5, { coordinateQuality: 'suspicious' })]).length, 2);
});

test('capture time prefers EXIF then known filenames then weak mtime and rejects invalid dates', () => {
  const file = { name: 'IMG_20261007_120000_001.jpg', lastModified: 123456 };
  assert.deepEqual(captureTime(file, { DateTimeOriginal: '2026:10:06 12:00:00' }),
    { captureTimeMs: Date.UTC(2026, 9, 6, 12), captureTimeSource: 'exif' });
  assert.equal(captureTime(file, { DateTimeOriginal: '2026:02:30 12:00:00', CreateDate: new Date(Date.UTC(2026, 9, 5)) }).captureTimeMs, Date.UTC(2026, 9, 5));
  assert.deepEqual(captureTime(file), { captureTimeMs: Date.UTC(2026, 9, 7, 12), captureTimeSource: 'filename' });
  assert.equal(captureTime({ name: 'IMG_20260230_120000.jpg', lastModified: 123456 }).captureTimeSource, 'lastModified');
  assert.equal(captureTime({ name: 'random.jpg' }).captureTimeSource, 'missing');
});

test('accuracy is parsed from existing OCR only; representative/index fallbacks preserve member data', async () => {
  assert.equal(parseAccuracy('точность ±3,48m'), 3.48);
  assert.equal(parseAccuracy('±2.1 м'), 2.1);
  assert.equal(parseAccuracy('3.48m'), null);
  let passes = 0;
  const read = await readPhoto({ name: 'IMG_20261007_120000.jpg' }, {
    readExif: async () => ({ coordinates: { latitude: 64, longitude: 30 } }),
    readOcr: async () => { passes++; return { rawText: '±3,48m' }; },
  });
  assert.equal(passes, 1);
  assert.equal(read.accuracyMeters, 3.48);
  const members = [photo(1, 0, 1, { accuracyMeters: 5 }), photo(2, 1, 2, { accuracyMeters: 1, indexFromOcr: null, indexStatus: 'missing' })];
  const point = makePoint(members);
  assert.equal(point.representativeId, '2');
  assert.equal(point.indexFromOcr, '6881');
  assert.deepEqual(point.coordinates, members[1].coordinates);
  assert.deepEqual(point.members, members);
  assert.equal(makePoint([photo(1), photo(2)]).representativeId, '1');
  assert.equal(makePoint([photo(1, 0, 1, { coordinates: null }), photo(2)]).representativeId, '2');
});

test('split/adjacent merge recomputes representative, exports and unchanged 25 m Main/Reserve', () => {
  const automatic = groupPhotos([photo(1), photo(2, 1, 2, { accuracyMeters: 1 }), photo(3, 40)]);
  assert.equal(automatic[0].representativeId, '2');
  assert.deepEqual([splitBatch(automatic).main.length, splitBatch(automatic).reserve.length], [2, 0]);
  const split = splitPoint(automatic, automatic[0].id);
  assert.equal(split.length, 3);
  assert.deepEqual([splitBatch(split).main.length, splitBatch(split).reserve.length], [2, 1]);
  const merged = mergePoint(split, split[1].id, -1);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].representativeId, '2');
  assert.deepEqual([splitBatch(merged).main.length, splitBatch(merged).reserve.length], [2, 0]);
  assert.deepEqual(mergePoint(split, split[0].id, 1), merged);
  assert.deepEqual(mergePoint(split, split[0].id, -1), split);
});
