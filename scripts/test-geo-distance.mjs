import assert from 'node:assert/strict';
import {
  EARTH_RADIUS_METERS,
  findDistanceViolations,
  getValidPointsForDistance,
  hasUsableCoordinates,
  haversineDistanceMeters,
  isValidCoordinate,
} from '../src/utils/geoDistance.js';

const point = (id, latitude, longitude, extra = {}) => ({
  id,
  fileName: `${id}.jpg`,
  latitude,
  longitude,
  coordinates: latitude === null || longitude === null ? null : { latitude, longitude },
  gpsSource: 'ocr',
  gpsStatus: 'found',
  gpsWarnings: [],
  ...extra,
});

assert.equal(haversineDistanceMeters(point('a', 64.588123, 30.601234), point('b', 64.588123, 30.601234)), 0);

const closeViolations = findDistanceViolations([
  point('a', 64.588123, 30.601234),
  point('b', 64.5882, 30.6013),
], { thresholdMeters: 25 });
assert.equal(closeViolations.length, 1);

const farViolations = findDistanceViolations([
  point('a', 64.588123, 30.601234),
  point('b', 64.6, 30.7),
], { thresholdMeters: 25 });
assert.equal(farViolations.length, 0);

const invalidSkipped = findDistanceViolations([
  point('a', 64.588123, 30.601234),
  point('bad', 120, 30.601234),
  point('b', 64.5882, 30.6013),
], { thresholdMeters: 25 });
assert.equal(invalidSkipped.length, 1);
assert.equal(isValidCoordinate(120, 30), false);
assert.equal(isValidCoordinate('', ''), false);
assert.equal(isValidCoordinate(null, null), false);

const threeClose = findDistanceViolations([
  point('a', 64.588123, 30.601234),
  point('b', 64.5882, 30.6013),
  point('c', 64.58825, 30.60135),
], { thresholdMeters: 25 });
const pairs = new Set(threeClose.map((violation) => `${violation.pointAId}-${violation.pointBId}`));
assert.equal(pairs.size, threeClose.length);
assert.equal([...pairs].some((pairName) => pairName === 'b-a'), false);

const thresholdLongitude = (25 / EARTH_RADIUS_METERS) * (180 / Math.PI);
const thresholdPointA = point('a', 0, 1);
const thresholdPointB = point('b', 0, 1 + thresholdLongitude);
const exactThresholdMeters = haversineDistanceMeters(thresholdPointA, thresholdPointB);
const exactlyThreshold = findDistanceViolations([thresholdPointA, thresholdPointB], { thresholdMeters: exactThresholdMeters });
assert.equal(exactlyThreshold.length, 0);

const missingNullViolations = findDistanceViolations([
  point('missing-a', null, null, { gpsSource: 'missing', gpsStatus: 'missing' }),
  point('missing-b', null, null, { gpsSource: 'missing', gpsStatus: 'missing' }),
], { thresholdMeters: 25 });
assert.equal(missingNullViolations.length, 0);

const missingZeroViolations = findDistanceViolations([
  point('zero-a', 0, 0, { gpsSource: 'missing', gpsStatus: 'missing' }),
  point('zero-b', 0, 0, { gpsSource: 'missing', gpsStatus: 'missing' }),
], { thresholdMeters: 25 });
assert.equal(missingZeroViolations.length, 0);

const ocrZeroViolations = findDistanceViolations([
  point('ocr-zero-a', 0, 0, { gpsWarnings: ['zero_zero_placeholder'] }),
  point('ocr-zero-b', 0, 0, { gpsWarnings: ['zero_zero_placeholder'] }),
], { thresholdMeters: 25 });
assert.equal(ocrZeroViolations.length, 0);
assert.equal(hasUsableCoordinates(point('ocr-zero-a', 0, 0, { gpsWarnings: ['zero_zero_placeholder'] })), false);
assert.equal(getValidPointsForDistance([point('ok', 64.588123, 30.601234), point('bad', null, null, { gpsSource: 'missing', gpsStatus: 'missing' })]).length, 1);
assert.equal(hasUsableCoordinates(point('pipeline-zero', 0, 0, { gpsStatus: 'done' })), false);
assert.equal(getValidPointsForDistance([point('pipeline-ok', 62.1, 34.1, { gpsStatus: 'done' })]).length, 1);

console.log('Geo distance tests passed');
