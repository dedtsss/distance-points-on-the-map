import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sessionMapPoints, sessionMapBounds, MAP_STYLE } from '../src/sessionMap.js';
import { groupPhotos, removeMember, restoreLastMember, moveMember, appendPhotos } from '../src/core/photoPoints.js';
import { splitBatch } from '../src/core/batch.js';
import { setPointRemoved } from '../src/pointState.js';

const photo = (id, longitude, accuracy = 10) => ({ id, number: Number(id), indexFromOcr: String(7000 + Number(id)),
  indexStatus: 'found', coordinates: { latitude: 64, longitude }, coordinateQuality: 'confident', gpsSource: 'exif', accuracyMeters: accuracy,
  captureTimeMs: 1700000000000, captureTimeSource: 'exif' });
const project = (rows) => {
  const grouped = splitBatch(rows);
  const byId = new Map([...grouped.main, ...grouped.reserve, ...grouped.unresolved].map((point) => [point.id, point]));
  return sessionMapPoints(rows, byId, (point) => ({ kind: grouped.unresolved.some((p) => p.id === point.id) ? 'review'
    : grouped.reserve.some((p) => p.id === point.id) ? 'reserve' : 'main', text: point.workStatus }),
  (point) => `#${point.indexFromOcr}`, { '1': 'local:first', '2': 'local:second' });
};

test('map is a live projection of membership, representative, exclusions, restore, move and append', () => {
  let rows = groupPhotos([photo('1', 30, 1), photo('2', 30.00001, 2), photo('3', 30.00035),
    { ...photo('4', 30.002), indexFromOcr: null, indexStatus: 'missing' }, { ...photo('5', 30.003), coordinates: null }]);
  const id = rows[0].id;
  let markers = project(rows);
  assert.equal(markers.length, 3);
  assert.deepEqual(markers.map((point) => point.status.kind), ['reserve', 'main', 'review']);
  assert.equal(markers[0].count, 2); assert.equal(markers[0].thumbnail, 'local:first');
  rows = removeMember(rows, id, '1'); markers = project(rows);
  assert.equal(markers[0].id, id); assert.equal(markers[0].count, 1);
  assert.equal(markers[0].longitude, 30.00001); assert.equal(markers[0].thumbnail, 'local:second');
  rows = restoreLastMember(rows, id); assert.equal(project(rows)[0].longitude, 30);
  const mainId = rows[1].id;
  rows = setPointRemoved(rows, mainId, true); markers = project(rows);
  assert.equal(markers.some((p) => p.id === mainId), false);
  assert.equal(markers[0].status.kind, 'main', 'reserve status recomputes after main removal');
  rows = setPointRemoved(rows, mainId, false);
  rows = moveMember(rows, id, '2', rows[1].id);
  assert.equal(project(rows).find((p) => p.id === id).count, 1);
  assert.equal(project(rows).find((p) => p.id === rows[1].id).count, 2);
  const appended = appendPhotos(rows, [photo('6', 30.01)]);
  assert.equal(project(appended).length, 4);
  const snapshot = structuredClone(rows); project(rows); assert.deepEqual(rows, snapshot, 'projection is read-only');
});

test('invalid coordinates, removed and empty placeholders never become current markers', () => {
  const rows = [photo('1', 30), { ...photo('2', 30), removed: true }, { ...photo('3', 30), emptyFromMove: true },
    photo('4', NaN), photo('5', 181), { ...photo('6', 30), coordinates: { latitude: 91, longitude: 30 } }];
  assert.deepEqual(sessionMapPoints(rows, new Map(), () => ({ kind: 'main' }), (p) => p.id).map((p) => p.id), ['1']);
  assert.equal(MAP_STYLE, 'https://tiles.openfreemap.org/styles/dark');
});

test('bounds fit empty, single, ordinary and date-line sessions', () => {
  assert.equal(sessionMapBounds([]), null);
  assert.deepEqual(sessionMapBounds([{ latitude: 64, longitude: 30 }]), [[30, 64], [30, 64]]);
  assert.deepEqual(sessionMapBounds([{ latitude: 63, longitude: 29 }, { latitude: 64, longitude: 31 }]), [[29, 63], [31, 64]]);
  assert.deepEqual(sessionMapBounds([{ latitude: 10, longitude: 179 }, { latitude: -10, longitude: -179 }]), [[179, -10], [181, 10]]);
});
