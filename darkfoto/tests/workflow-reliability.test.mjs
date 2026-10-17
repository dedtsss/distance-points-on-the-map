import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupPhotos, GROUP_DEFAULTS, makePoint, splitPoint, selectRepresentative, moveMember, removeMember, mergePoint, mergeIntoPoint, appendPhotos } from '../src/core/photoPoints.js';
import { splitBatch } from '../src/core/batch.js';
import { haversineDistanceMeters } from '../src/core/utils/geoDistance.js';
import { validateRecovery, createRecoveryWriter } from '../src/recovery.js';
import { establishReviewSlots } from '../src/pointState.js';
import { formatPhotoResultBlock } from '../src/core/features/export/resultBlockFormatter.js';
const mode = { indexMode: false };
const photo = (number, meters = 0, extra = {}) => ({ id: String(number), number,
  fileName: `synthetic-${number}.jpg`, coordinates: { latitude: 0, longitude: 1 + meters * 180 / (Math.PI * 6371000) },
  coordinateQuality: 'confident', gpsSource: 'exif', captureTimeSource: 'exif', captureTimeMs: number * 86_400_000,
  indexStatus: 'disabled', uploadResult: { links: [] }, ...extra });
const group = (photos) => groupPhotos(photos, GROUP_DEFAULTS, mode);
const analyze = (points) => splitBatch(points, 25, mode);
const snapshot = (rows) => ({ schemaVersion: 1, files: Array.from({ length: rows.flatMap((p) => [...p.members, ...(p.excludedMembers || [])]).length }, (_, i) => ({ id: `native-${i}`, name: `synthetic-${i}.jpg`, native: true })),
  rows, phase: 'reviewing', publisher: 'ninjabox', onion: 'http://synthetic.onion', screen: 'photos', indexMode: false,
  session: 'Сессия', color: 'Цвет', packing: 'Фасовка', comment: 'Комментарий', resumeAvailable: true });

test('whole-batch A1 B1 A2 with days between captures, multiple intervening points and exact duplicates', () => {
  const input = [photo(1), photo(2, 50), photo(3), photo(4, 100), photo(5), photo(6, 50)];
  const points = group(input);
  assert.deepEqual(points.map((p) => p.members.map((m) => m.id)), [['1', '3', '5'], ['2', '6'], ['4']]);
  assert.deepEqual(group([...input].reverse()), points);
  assert.equal(analyze(points).reserve.length, 0, 'duplicates cannot create a 0 m Reserve');
  assert.deepEqual(group(input.slice(0, 3)).map((p) => p.members.length), [2, 1]);
});

test('tight 3 m rule keeps nearby distinct points and prevents anchor/representative bridges', () => {
  assert.equal(group([photo(1), photo(2, 8)]).length, 2);
  assert.deepEqual(group([photo(1), photo(2, 2.5), photo(3, 5)]).map((p) => p.members.length), [2, 1]);
  const points = group([photo(1), photo(2, -2.5), photo(3, 2.5, { accuracyMeters: 1 })]);
  assert.equal(points.length, 2, 'new best representative cannot stretch its farthest member to 5 m');
  for (const p of points) for (const m of p.members) assert.ok(haversineDistanceMeters(p, m) <= 3);
  // Two equidistant compatible entities are ambiguous: create a new entity.
  assert.equal(group([photo(1, -2), photo(2, 2), photo(3)]).length, 3);
});

for (const meters of [22.9, 23.0, 24.0, 25.0]) test(`fixed tolerance boundary ${meters.toFixed(1)} m`, () => {
  const points = [makePoint([photo(1)]), makePoint([photo(2, meters, { accuracyMeters: 9999, altitude: 9999 })])];
  const result = analyze(points);
  assert.equal(result.reserve.length, meters < 23 ? 1 : 0);
  assert.equal(result.main.length, meters < 23 ? 1 : 2);
  assert.equal(result.main.filter((p) => p.toleranceConflicts.length).length, meters >= 23 && meters < 25 ? 2 : 0);
  assert.equal(result.remainingConflicts.length, 0);
});

test('manual Reserve/Main/Auto choices, forced Main conflict, derived-status repeat, representative independence', () => {
  let points = [makePoint([photo(1), photo(3, 1)]), makePoint([photo(2, 10)])];
  points[1].statusOverride = 'main';
  assert.equal(analyze(points).reserve[0].id, points[0].id, 'Auto yields to later forced Main');
  points[0].statusOverride = 'main';
  const forced = analyze(points);
  assert.equal(forced.main.length, 2); assert.equal(forced.remainingConflicts.length, 1);
  assert.ok(forced.main.every((p) => p.manualConflicts.length === 1));
  points = selectRepresentative(points, points[0].id, '3');
  assert.equal(points[0].statusOverride, 'main');
  points[1].statusOverride = 'reserve';
  assert.equal(analyze(points).reserve[0].id, points[1].id);
  assert.equal(analyze([points[1]]).reserve.length, 1, 'forced Reserve remains Reserve without neighbors');
  points[0].statusOverride = null; points[1].statusOverride = null;
  const automatic = analyze(points);
  assert.equal(automatic.reserve.length, 1);
  const repeat = analyze([...automatic.main, ...automatic.reserve]);
  assert.deepEqual(repeat.reserve.map((p) => p.id), automatic.reserve.map((p) => p.id));
});

test('status analysis does not undo manual split/move/merge; split inherits override', () => {
  let points = group([photo(1), photo(2, 50), photo(3)]);
  points[0].statusOverride = 'main';
  points = splitPoint(points, points[0].id);
  assert.equal(points[1].statusOverride, 'main');
  points = moveMember(points, '3', '3', '2');
  const before = structuredClone(points);
  analyze(points); assert.deepEqual(points, before);
  assert.equal(points[2].members.length, 2);
  points = appendPhotos(points, [photo(4)], GROUP_DEFAULTS, mode);
  assert.equal(points.length, 3, 'append does not coalesce manual points');
  points = mergePoint(points, '1', 1);
  assert.equal(points[0].statusOverride, 'main');
});

test('exact recovery round-trip retains edited membership, excluded members, representative, overrides and stale publication', () => {
  let points = group([photo(1), photo(2, 50), photo(3), photo(4, 100), photo(5)]);
  points = selectRepresentative(points, points[0].id, '3');
  points = removeMember(points, points[0].id, '1');
  points = moveMember(points, points[0].id, '5', points[1].id);
  points[0].statusOverride = 'main'; points[1].statusOverride = 'reserve';
  points[0].uploadResult = { stale: true, staleLinks: [{ provider: 'ninjabox', url: 'https://example.com/old' }], links: [] };
  points[1].uploadResult = { links: [{ provider: 'ninjabox', url: 'https://example.com/current' }] };
  points[2].removed = true;
  const saved = JSON.parse(JSON.stringify(snapshot(establishReviewSlots(points, analyze(points)))));
  assert.deepEqual(validateRecovery(JSON.parse(JSON.stringify(saved))), saved);
  assert.throws(() => validateRecovery({ ...saved, files: saved.files.slice(1) }), /invalid/);
  assert.throws(() => validateRecovery({ ...saved, rows: saved.rows.map((p) => ({ ...p, statusOverride: 'invalid' })) }), /invalid/);
  assert.throws(() => validateRecovery({ ...saved, schemaVersion: 2 }), /invalid/);
  assert.throws(() => validateRecovery({ ...saved, rows: saved.rows.map((p) => ({ ...p, uploadResult: { links: 'damaged' } })) }), /invalid/);
  assert.deepEqual(validateRecovery({ ...saved, files: [], rows: [], phase: 'selected' }).rows, []);
});

test('distant visual merge preserves ownership, overrides, representative, removal undo and invalidates both publications', () => {
  let points = group([photo(1), photo(2, 50), photo(3), photo(4, 100), photo(5)]);
  points = selectRepresentative(points, points[0].id, '3');
  points = removeMember(points, points[0].id, '1');
  const sourceId = points[0].id, targetId = points[2].id;
  points[0].statusOverride = 'reserve'; points[2].statusOverride = 'main';
  points[0].uploadResult = { links: [{ provider: 'onion', url: 'https://example.com/source' }] };
  points[2].uploadResult = { links: [{ provider: 'onion', url: 'https://example.com/target' }] };
  const merged = mergeIntoPoint(points, sourceId, targetId);
  const target = merged.find((p) => p.id === targetId);
  assert.equal(merged.length, 2); assert.equal(target.statusOverride, 'main');
  assert.equal(target.manualRepresentativeId, '3');
  assert.deepEqual(target.members.map((p) => p.id), ['3', '4', '5']);
  assert.deepEqual(target.excludedMembers.map((p) => p.id), ['1']);
  assert.equal(target.memberUndo.length, 1);
  assert.equal(target.uploadResult.stale, true); assert.deepEqual(target.uploadResult.links, []);
  assert.equal(target.uploadResult.staleLinks.length, 2);
  const saved = JSON.parse(JSON.stringify(snapshot(establishReviewSlots(merged, analyze(merged)))));
  assert.deepEqual(validateRecovery(saved), saved);
  assert.equal(mergeIntoPoint(merged, targetId, targetId), merged);
});

test('debounced recovery snapshots, background flush, reset waits for save and discards pending writes', async () => {
  const events = [];
  let finish;
  const saved = snapshot([makePoint([photo(1)])]);
  const writer = createRecoveryWriter({ delay: 10_000, save: (state, photos) => {
    events.push(['save', state.session, photos]); return new Promise((resolve) => { finish = resolve; });
  }, clear: async () => { events.push(['clear']); }, onError: (error) => { throw error; } });
  writer.schedule(saved); saved.session = 'edited'; writer.schedule(saved);
  const flushing = writer.flush(); await Promise.resolve();
  writer.schedule({ ...saved, session: 'must not resurrect' });
  const clearing = writer.clear();
  assert.deepEqual(events, [['save', 'edited', true]]);
  finish(); await flushing; await clearing; await writer.flush();
  assert.deepEqual(events, [['save', 'edited', true], ['clear']]);
});

test('TXT/copy no-index identity is №N, indexed identity remains #NNNN', () => {
  assert.equal(formatPhotoResultBlock(photo(1), { indexMode: false, session: 'Сессия' }).split('\n')[0], '№1 / Сессия');
  assert.equal(formatPhotoResultBlock(photo(1, 0, { indexFromOcr: '01234' }), { session: 'Сессия' }).split('\n')[0], '#01234 / Сессия');
});
