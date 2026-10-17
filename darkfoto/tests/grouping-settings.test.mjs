import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupPhotos, regroupPhotos, makePoint, removeMember } from '../src/core/photoPoints.js';
import { splitBatch } from '../src/core/batch.js';
import { haversineDistanceMeters } from '../src/core/utils/geoDistance.js';
import { readPreferences, savePreferences, PREFERENCES_KEY } from '../src/preferences.js';
import { localSessionPlan } from '../src/localSessionExport.js';
import { nearbyMapPoints } from '../src/sessionMap.js';

const photo = (number, meters = 0, extra = {}) => ({ id: String(number), number,
  fileName: `synthetic-${number}.jpg`, coordinates: { latitude: 64 + meters * 180 / (Math.PI * 6371000), longitude: 30 },
  coordinateQuality: 'confident', gpsSource: 'ocr', ocrStatus: 'confident', gpsConfidence: 0.9, indexStatus: 'missing',
  captureTimeSource: 'filename', captureTimeMs: number * 86_400_000, uploadResult: { links: [] }, ...extra });
const membership = (points) => points.map((point) => point.members.map((member) => member.id));

for (const gpsSource of ['ocr', 'exif', 'mixed']) for (const indexMode of [false, true]) {
  test(`${gpsSource}, index ${indexMode}: global A1 B1 A2 rejoin despite days, order and unrelated indexes`, () => {
    const photos = [photo(1), photo(2, 50), photo(3, 1.9), photo(4), photo(5, 50)].map((p, i) => ({ ...p,
      gpsSource: gpsSource === 'mixed' ? i % 2 ? 'ocr' : 'exif' : gpsSource,
      indexFromOcr: indexMode ? String(1000 + i * 1000) : null, indexStatus: indexMode ? 'found' : 'disabled',
    }));
    const grouped = groupPhotos(photos, undefined, { indexMode });
    assert.deepEqual(membership(grouped), [['1', '3', '4'], ['2', '5']]);
    assert.deepEqual(groupPhotos([...photos].reverse(), undefined, { indexMode }), grouped);
  });
}

test('default 4 m: 0/1.9/4.0 collapse, 4.1 separate; custom radius and complete-link bridge bound', () => {
  for (const [meters, expected] of [[0, 1], [1.9, 1], [4, 1], [4.1, 2]]) {
    assert.equal(groupPhotos([photo(1), photo(2, meters)]).length, expected);
  }
  assert.equal(groupPhotos([photo(1), photo(2, 1.9)], { radiusMeters: 1.5 }).length, 2);
  assert.equal(groupPhotos([photo(1), photo(2, 4.1)], { radiusMeters: 4.5 }).length, 1);
  for (const offsets of [[0, 3, 6], [3, 0, 6], [0, -3, 3]]) {
    const points = groupPhotos(offsets.map((m, i) => photo(i + 1, m, { accuracyMeters: 3 - i })));
    assert.equal(points.length, 2);
    for (const p of points) for (const a of p.members) for (const b of p.members)
      assert.ok(haversineDistanceMeters(a, b) <= 4 + 1e-7);
  }
});

test('ambiguous compatible groups select nearest, tie by deterministic point order; duplicate always rejoins', () => {
  assert.deepEqual(membership(groupPhotos([photo(1, 0), photo(2, 6), photo(3, 3.5)])), [['1'], ['2', '3']]);
  const tie = [photo(1, -3), photo(2, 3), photo(3, 0), photo(4, 3)];
  assert.deepEqual(membership(groupPhotos(tie)), [['1', '3'], ['2', '4']]);
  assert.deepEqual(groupPhotos([...tie].reverse()), groupPhotos(tie));
  // A duplicate stays with its first copy even when another representative is nearer.
  assert.deepEqual(membership(groupPhotos([photo(1), photo(2, 3.9), photo(3, 6), photo(4, 3.9)])), [['1', '2', '4'], ['3']]);
});

test('untrusted/invalid/missing coordinates never acquire confident grouping from time alone', () => {
  for (const extra of [{ coordinateQuality: 'low_precision' }, { coordinates: null },
    { coordinates: { latitude: 91, longitude: 30 } }]) {
    assert.equal(groupPhotos([photo(1), photo(2, 0, extra)]).length, 2);
  }
});

for (const meters of [27.9, 28, 29, 30]) test(`configured minimum 30 m boundary ${meters}`, () => {
  const rows = [makePoint([photo(1)]), makePoint([photo(2, meters)])];
  const result = splitBatch(rows, 30, { indexMode: false });
  assert.equal(result.reserve.length, meters < 28 ? 1 : 0);
  assert.equal(result.main.filter((p) => p.toleranceConflicts.length).length, meters >= 28 && meters < 30 ? 2 : 0);
  assert.equal(result.thresholdMeters, 30);
  rows.forEach((p) => { p.statusOverride = 'main'; });
  assert.equal(splitBatch(rows, 30, { indexMode: false }).remainingConflicts.length, meters < 28 ? 1 : 0);
});

test('preferences survive independent storage/restart; bounds/steps/corrupt settings are safe', () => {
  const values = new Map(), storage = { getItem: (k) => values.get(k), setItem: (k, v) => values.set(k, v) };
  assert.deepEqual(readPreferences(storage), { radiusMeters: 4, minimumDistanceMeters: 25 });
  savePreferences({ radiusMeters: 4.5, minimumDistanceMeters: 30 }, storage);
  assert.deepEqual(readPreferences(storage), { radiusMeters: 4.5, minimumDistanceMeters: 30 });
  assert.equal(values.size, 1); assert.ok(values.has(PREFERENCES_KEY));
  assert.deepEqual(savePreferences({ radiusMeters: 100, minimumDistanceMeters: -2 }, storage), { radiusMeters: 10, minimumDistanceMeters: 5 });
  assert.equal(savePreferences({ radiusMeters: 1.9 }, storage).radiusMeters, 2);
  storage.setItem(PREFERENCES_KEY, '{bad');
  assert.deepEqual(readPreferences(storage), { radiusMeters: 4, minimumDistanceMeters: 25 });
});

test('explicit current-job repair preserves every recognized photo/evidence and invalidates all prior publication', () => {
  const originals = [photo(1), photo(2, 50), photo(3, 1.9), photo(4, 4.1)];
  let rows = originals.map((p) => makePoint([p]));
  rows[0].statusOverride = 'reserve'; rows[0].manualRepresentativeId = '1';
  rows[0].uploadResult = { links: [{ provider: 'ninjabox', url: 'https://example.com/old' }] };
  rows = removeMember(rows, '4', '4');
  const snapshot = structuredClone(rows);
  const rebuilt = regroupPhotos(rows, { radiusMeters: 4 });
  assert.deepEqual(rows, snapshot, 'original job is not mutated');
  assert.deepEqual(membership(rebuilt), [['1', '3'], ['2'], ['4']]);
  assert.equal(rebuilt.flatMap((p) => p.members).length, originals.length);
  for (const p of rebuilt) {
    assert.equal(p.statusOverride, null); assert.equal(p.manualRepresentativeId, null); assert.equal(p.removed, false);
    for (const member of p.members) {
      const original = originals.find((item) => item.id === member.id);
      assert.deepEqual(member.coordinates, original.coordinates);
      assert.equal(member.gpsSource, original.gpsSource); assert.equal(member.captureTimeMs, original.captureTimeMs);
    }
  }
  assert.equal(rebuilt[0].uploadResult.stale, true); assert.deepEqual(rebuilt[0].uploadResult.links, []);
});

test('configured minimum reaches local export statuses and map nearby selector', () => {
  const rows = [makePoint([photo(1)]), makePoint([photo(2, 26)])];
  assert.ok(localSessionPlan(rows, { indexMode: false, minimumDistanceMeters: 30 }).points.some((p) => p.text.includes('Статус: Резерв')));
  assert.ok(localSessionPlan(rows, { indexMode: false }).points.every((p) => p.text.includes('Статус: Основное')));
  const markers = rows.map((p) => ({ id: p.id, ...p.coordinates }));
  assert.equal(nearbyMapPoints(markers, '1').length, 1);
  assert.equal(nearbyMapPoints(markers, '1', 30).length, 2);
});
