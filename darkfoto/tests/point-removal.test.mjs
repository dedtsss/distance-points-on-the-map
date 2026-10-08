import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makePoint, pointMembers } from '../src/core/photoPoints.js';
import { splitBatch } from '../src/core/batch.js';
import { activePoints, setPointRemoved, establishReviewSlots, reviewSections } from '../src/pointState.js';
import { buildResultText } from '../src/resultSummary.js';
import { buildGpx, buildPointGpx, resultBlocksForCopy, hasPointCoordinates } from '../src/resultExports.js';
import { validateRecovery } from '../src/recovery.js';
import { publishBatch } from '../src/publishBatch.js';

const photo = (number, meters = number * 50, extra = {}) => ({
  id: String(number), number, fileName: `source-${number}.jpg`,
  indexFromOcr: String(6880 + number), indexStatus: 'found', coordinateQuality: 'confident', gpsSource: 'exif',
  coordinates: { latitude: 64, longitude: 30 + meters * .00002052 }, uploadResult: { links: [] }, ...extra,
});
const points = () => [photo(1, 0), photo(2, 10), photo(3, 100), photo(4, 150),
  photo(5, 200, { indexFromOcr: null, indexStatus: 'missing' })].map((item) => makePoint([item]));
const ordered = () => { const rows = points(); return establishReviewSlots(rows, splitBatch(rows)); };
const displayIds = (rows) => reviewSections(rows, splitBatch(rows)).flatMap((section) => section.items.map((row) => row.id));

test('remove -> TXT absent; restore -> TXT present, copy and 25 m classification recomputed', () => {
  const rows = ordered();
  const removed = setPointRemoved(rows, '1', true);
  const grouped = splitBatch(removed);
  assert.doesNotMatch(buildResultText({ grouped }), /#6881/);
  assert.doesNotMatch(resultBlocksForCopy(grouped).join('\n'), /#6881/);
  assert.equal(grouped.main.some((row) => row.id === '2'), true);
  assert.equal(grouped.reserve.length, 0);
  const restored = splitBatch(setPointRemoved(removed, '1', false));
  assert.match(buildResultText({ grouped: restored }), /#6881/);
  assert.match(resultBlocksForCopy(restored).join('\n'), /#6881/);
  assert.deepEqual(restored.reserve.map((row) => row.id), ['2']);
  assert.deepEqual(points().flatMap(pointMembers).map((member) => member.fileName),
    rows.flatMap(pointMembers).map((member) => member.fileName));
});

test('multiple removed placeholders survive recovery and arbitrary restore with stable alternating slots', () => {
  let rows = ordered();
  assert.deepEqual(displayIds(rows), ['1', '3', '4', '2', '5']);
  const initial = displayIds(rows);
  for (const id of ['1', '4', '5']) rows = setPointRemoved(rows, id, true);
  const state = validateRecovery(JSON.parse(JSON.stringify({ rows,
    files: Array.from({ length: 5 }, (_, i) => ({ id: String(i + 1) })), publisher: 'none', phase: 'review' })));
  rows = state.rows;
  assert.equal(rows.length, 5);
  assert.deepEqual(rows.filter((row) => row.removed).map((row) => row.id), ['1', '4', '5']);
  assert.deepEqual(displayIds(rows), initial);
  for (const [id, remaining] of [['4', ['1', '5']], ['5', ['1']], ['1', []]]) {
    rows = setPointRemoved(rows, id, false);
    assert.deepEqual(rows.filter((row) => row.removed).map((row) => row.id), remaining);
    assert.deepEqual(displayIds(rows), initial);
  }
  for (const row of ordered()) rows = setPointRemoved(rows, row.id, true);
  assert.equal(activePoints(rows).length, 0);
  assert.deepEqual(displayIds(rows), initial);
  assert.equal(splitBatch(rows).main.length, 0);
});

test('aggregate GPX excludes removed; one-point GPX uses representative even when removed or index missing', () => {
  const rows = setPointRemoved(ordered(), '1', true);
  const aggregate = buildGpx(splitBatch(rows));
  assert.doesNotMatch(aggregate, /#6881/);
  assert.equal((aggregate.match(/<wpt /g) || []).length, 3);
  for (const point of [rows[0], rows[2], rows[4]]) {
    const gpx = buildPointGpx(point);
    assert.equal((gpx.match(/<wpt /g) || []).length, 1);
    assert.match(gpx, new RegExp(`#${point.indexFromOcr || point.id}`));
    assert.match(gpx, /lat="64"/);
  }
  const group = makePoint([photo(1, 0, { accuracyMeters: 5 }), photo(2, 5, { accuracyMeters: 1 })]);
  assert.match(buildPointGpx({ ...group, removed: true }), /#6882/);
  assert.equal(hasPointCoordinates({ coordinates: { latitude: null, longitude: 30 } }), false);
  assert.equal(hasPointCoordinates({ coordinates: { latitude: 91, longitude: 30 } }), false);
});

test('publication only reads active source photos, retains removed recovery rows and skips completed links', async () => {
  let rows = setPointRemoved(ordered(), '1', true);
  rows = setPointRemoved(rows, '3', true);
  const read = [], uploads = [], totals = [];
  const options = { publisher: 'ninjabox', destination: 'https://relay.example',
    fileAt: async (index) => { read.push(index); return { name: `photo-${index}` }; },
    clean: async (file) => ({ ok: true, file }),
    publishNinjabox: async (file) => { uploads.push(file.name); return 'https://ninjabox.org/gallery'; },
    onRows: (updated) => { rows = updated; assert.equal(rows.length, 5); },
    onProgress: (_stage, _done, total) => totals.push(total),
  };
  await publishBatch(rows, new Set(), options);
  assert.deepEqual(read, [1, 3, 4]);
  assert.equal(uploads.length, 3);
  assert.ok(totals.every((total) => total === 3));
  assert.equal(rows[0].uploadResult.links.length, 0);
  rows = setPointRemoved(rows, '1', false);
  await publishBatch(rows, new Set(), options);
  assert.deepEqual(read, [1, 3, 4, 0]);
  assert.equal(uploads.length, 4);
  assert.equal(rows[2].removed, true);
});
