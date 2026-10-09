import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makePoint, pointMembers, moveMember, removeMember, appendPhotos, restoreMemberPoint, splitPoint, mergePoint } from '../src/core/photoPoints.js';
import { activePoints, establishReviewSlots, setPointRemoved, reviewSections } from '../src/pointState.js';
import { splitBatch } from '../src/core/batch.js';
import { buildResultText } from '../src/resultSummary.js';
import { buildGpx, buildPointGpx, resultBlocksForCopy } from '../src/resultExports.js';
import { validateRecovery } from '../src/recovery.js';
import { publishBatch } from '../src/publishBatch.js';

const photo = (number, meters = 0, extra = {}) => ({ id: String(number), number,
  fileName: `private-${number}.jpg`, indexFromOcr: String(6950 + number), indexStatus: 'found',
  coordinates: { latitude: 64, longitude: 30 + meters * .00002052 }, coordinateQuality: 'confident', gpsSource: 'exif',
  accuracyMeters: number, captureTimeMs: 1700000000000 + number * 1000, captureTimeSource: 'exif',
  uploadResult: { links: [] }, ...extra });
const fixture = () => {
  const points = [makePoint([photo(1, 100)]), makePoint([photo(2), photo(3, 1), photo(4, 2)])];
  return establishReviewSlots(points, splitBatch(points));
};
const membership = (points) => points.map((point) => pointMembers(point).map((member) => member.id));
const recover = (rows, count) => validateRecovery(JSON.parse(JSON.stringify({ rows,
  files: Array.from({ length: count }, (_, i) => ({ id: String(i + 1) })), publisher: 'ninjabox' }))).rows;
const completed = (points) => points.map((point) => ({ ...point,
  uploadResult: { links: [{ provider: 'ninjabox', url: `https://example.org/old/${point.id}` },
    { provider: 'other', url: `https://other.example/${point.id}` }] } }));

test('A=1 / B=3: move third member yields A=2 / B=2 with stable entity IDs and order', () => {
  const before = fixture();
  const moved = moveMember(before, before[1].id, '4', before[0].id);
  assert.deepEqual(membership(moved), [['1', '4'], ['2', '3']]);
  assert.deepEqual(moved.map((point) => point.id), before.map((point) => point.id));
  assert.deepEqual(moved.map((point) => point.reviewSlot), before.map((point) => point.reviewSlot));
  assert.deepEqual(recover(moved, 4), JSON.parse(JSON.stringify(moved)));
});

test('representative move/remove recomputes index, GPS, accuracy, counts, 25 m and every export', () => {
  const before = fixture();
  const moved = moveMember(before, before[1].id, '2', before[0].id);
  assert.equal(moved[1].representativeId, '3');
  assert.equal(moved[1].indexFromOcr, '6953');
  assert.deepEqual(moved[1].coordinates, before[1].members[1].coordinates);
  assert.equal(moved[1].accuracyMeters, 3);
  const removed = removeMember(before, before[1].id, '2');
  assert.equal(removed[1].representativeId, '3');
  assert.deepEqual(membership(removed), [['1'], ['3', '4']]);
  const grouped = splitBatch(removed);
  assert.doesNotMatch(buildResultText({ grouped }), /#6952|private-2/);
  assert.match(resultBlocksForCopy(grouped).join('\n'), /#6953/);
  assert.match(buildPointGpx(removed[1]), /#6953/);
  assert.equal((buildGpx(grouped).match(/<wpt /g) || []).length, 2);
  const close = [makePoint([photo(1, 0), photo(2, 40, { accuracyMeters: .1 })]), makePoint([photo(3, 2)])];
  assert.equal(splitBatch(close).reserve.length, 0);
  const conflicts = splitBatch(removeMember(close, close[0].id, '2'));
  assert.equal(conflicts.reserve.length, 1);
  assert.equal(conflicts.reserve[0].reserveConflicts[0].otherLabel, `#${conflicts.main[0].indexFromOcr}`);
  recover(removed, 4);
});

test('sole removal retains recoverable point; sole move keeps excluded placeholder without duplicate ownership', () => {
  const before = fixture();
  const removed = removeMember(before, before[0].id, '1');
  assert.equal(removed[0].removed, true);
  assert.ok(activePoints(removed).every((point) => pointMembers(point).length));
  assert.deepEqual(membership(restoreMemberPoint(recover(removed, 4), before[0].id)), membership(before));
  const moved = moveMember(before, before[0].id, '1', before[1].id);
  assert.equal(moved[0].removed, true);
  assert.deepEqual(membership(moved), [[], ['1', '2', '3', '4']]);
  assert.deepEqual(membership(restoreMemberPoint(recover(moved, 4), before[0].id)), membership(before));
  // The moved member can also be individually excluded from its destination.
  const excluded = removeMember(moved, moved[1].id, '1');
  assert.deepEqual(membership(restoreMemberPoint(recover(excluded, 4), before[0].id)), membership(before));
});

test('explicit move accepts missing GPS/index/time, even into a target with no evidence', () => {
  const unknown = (n) => photo(n, 0, { coordinates: null, coordinateQuality: 'missing',
    indexFromOcr: null, indexStatus: 'missing', captureTimeMs: null });
  const points = [makePoint([unknown(1)]), makePoint([unknown(2)])];
  const moved = moveMember(points, '1', '1', '2');
  assert.deepEqual(membership(moved), [[], ['1', '2']]);
  assert.equal(splitBatch(moved).unresolved.length, 1);
  assert.equal(moveMember(points, '1', '1', 'missing'), points);
});

test('split after an empty-source move never reuses the removed entity identity; legacy flat source recovers', () => {
  const before = [photo(1, 100), makePoint([photo(2), photo(3)])];
  const moved = moveMember(before, '1', '1', before[1].id);
  const split = splitPoint(moved, before[1].id);
  assert.equal(new Set(split.map((point) => point.id)).size, split.length);
  const restored = restoreMemberPoint(recover(split, 3), '1');
  assert.equal(restored[0].removed, false);
  assert.deepEqual(pointMembers(restored[0]).map((member) => member.id), ['1']);
  assert.ok(activePoints(restored).every((point) => pointMembers(point).length));
});

test('append safely attaches using accepted evidence, preserving manual grouping and excluded slots', () => {
  let before = fixture();
  before = setPointRemoved(before, before[0].id, true);
  const added = appendPhotos(before, [photo(5, 1), photo(6, 100), photo(7, 200, { coordinates: null, coordinateQuality: 'missing' })]);
  assert.equal(added[0], before[0]);
  assert.equal(added[1].id, before[1].id);
  assert.deepEqual(membership(added), [['1'], ['2', '3', '4', '5'], ['6'], ['7']]);
  assert.equal(splitBatch(added).unresolved.length, 1);
  assert.equal(added[0].reviewSlot, before[0].reviewSlot);
  recover(added, 7);
  // Two manually separated points both fit: preserve both and keep a new entity.
  const manual = [makePoint([photo(1)]), makePoint([photo(2, 1)])];
  const ambiguous = appendPhotos(manual, [photo(3, 1)]);
  assert.equal(ambiguous.length, 3);
  assert.equal(ambiguous[0], manual[0]);
  assert.equal(ambiguous[1], manual[1]);
  assert.equal(appendPhotos(manual, [photo(4, 8, { indexFromOcr: '9000' })]).length, 3);
  assert.equal(appendPhotos(manual.slice(0, 1), [photo(4, 8, { captureTimeSource: 'lastModified' })]).length, 2);
});

test('individual exclusions survive whole-point split/merge and recovery without source loss', () => {
  const before = fixture();
  const removed = removeMember(before, before[1].id, '3');
  const split = splitPoint(removed, before[1].id);
  const merged = mergePoint(split, split[1].id, 1);
  assert.deepEqual(membership(recover(merged, 4)), [['1'], ['2', '4']]);
  assert.deepEqual(merged[1].excludedMembers.map((member) => member.id), ['3']);
  assert.deepEqual(reviewSections(removed, splitBatch(removed)).flatMap((section) => section.items.map((point) => point.id)), before.map((point) => point.id));
});

test('membership invalidation excludes all stale providers from TXT and copy; retry only changed points', async () => {
  const before = completed([...fixture(), makePoint([photo(5, 200)])]);
  const old = before.flatMap((point) => point.uploadResult.links.map((link) => link.url));
  const moved = moveMember(before, before[1].id, '4', before[0].id);
  assert.deepEqual(moved.map((point) => Boolean(point.uploadResult.stale)), [true, true, false]);
  assert.equal(moved[2], before[2]);
  for (const text of [buildResultText({ grouped: splitBatch(moved) }), ...resultBlocksForCopy(splitBatch(moved))]) {
    for (const url of old.slice(0, 4)) assert.ok(!text.includes(url));
  }
  const reads = [], uploads = [];
  const options = { publisher: 'ninjabox', destination: 'https://relay.example',
    fileAt: async (number) => { reads.push(number); return {}; },
    clean: async (_file, { preferredFilename }) => ({ ok: true, file: { name: preferredFilename } }),
    publishNinjabox: async (files) => { uploads.push(files); return `https://example.org/new/${uploads.length}`; } };
  await publishBatch(recover(moved, 5), new Set(), { ...options, onRows: (points) => { moved.splice(0, moved.length, ...points); } });
  assert.deepEqual(reads, [0, 3, 1, 2]);
  assert.equal(uploads.length, 2);
  assert.equal(moved[2].uploadResult.links[0].url, old[4]);
  assert.ok(moved.every((point) => !point.uploadResult.stale));
  await publishBatch(moved, new Set(), options);
  assert.equal(uploads.length, 2);
  assert.match(buildResultText({ grouped: splitBatch(moved) }), /https:\/\/example.org\/new\/1/);
});

test('append/remove invalidate only changed publication and failed re-publication never revives stale URLs', async () => {
  const before = completed(fixture());
  const appended = appendPhotos(before, [photo(5, 1)]);
  assert.equal(appended[0], before[0]);
  assert.equal(appended[1].uploadResult.stale, true);
  const removed = removeMember(appended, appended[1].id, '3');
  let uploads = 0;
  await publishBatch(removed, new Set(), { publisher: 'ninjabox', destination: 'https://relay.example',
    fileAt: async () => ({}), clean: async () => ({ ok: true, file: {} }),
    publishNinjabox: async () => { uploads++; throw new Error('offline'); } });
  assert.equal(uploads, 1);
  assert.equal(removed[1].uploadResult.stale, true);
  assert.ok(!buildResultText({ grouped: splitBatch(removed) }).includes(before[1].uploadResult.links[0].url));
});
