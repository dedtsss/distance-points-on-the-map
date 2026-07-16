import assert from 'node:assert/strict';
import { buildMapModel, mapPointLabel } from '../src/features/map/mapModel.js';

const photos = [
  {
    id: 'a',
    number: 1,
    indexFromOcr: '5939',
    indexStatus: 'found',
    coordinates: { latitude: 62.1, longitude: 34.1 },
    coordinateQuality: 'confident',
    gpsStatus: 'done',
  },
  {
    id: 'b',
    number: 2,
    coordinates: { latitude: 62.10001, longitude: 34.10001 },
    coordinateQuality: 'manual',
    gpsStatus: 'done',
  },
  {
    id: 'low',
    number: 3,
    indexFromOcr: '6001',
    indexStatus: 'uncertain',
    coordinates: { latitude: 62.10002, longitude: 34.10002 },
    coordinateQuality: 'low_precision',
    gpsStatus: 'low_precision',
  },
  {
    id: 'suspicious',
    number: 4,
    coordinates: { latitude: 30.1, longitude: 164.1 },
    coordinateQuality: 'suspicious',
    gpsStatus: 'suspicious',
  },
  {
    id: 'missing',
    number: 5,
    coordinates: null,
    coordinateQuality: 'missing',
    gpsStatus: 'missing',
  },
];

const model = buildMapModel(photos, 25);

assert.equal(mapPointLabel(photos[0]), '5939');
assert.equal(mapPointLabel(photos[1]), 'Фото 2');
assert.equal(model.points.length, 4);
assert.deepEqual(model.strictPoints.map((point) => point.id), ['a', 'b']);
assert.equal(model.lowPrecision.length, 1);
assert.equal(model.suspicious.length, 1);
assert.equal(model.missingCoordinates.length, 1);
assert.equal(model.lines.length, 1);
assert.equal(model.lines[0].pointAId, 'a');
assert.equal(model.lines[0].pointBId, 'b');
assert.equal(model.conflicts.length, 1);
assert.equal(model.conflicts[0].conflict, true);
assert.equal(model.lines.some((line) => line.pointAId === 'low' || line.pointBId === 'low'), false);

console.log('Map model tests passed');
