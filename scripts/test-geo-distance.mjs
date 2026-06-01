import assert from 'node:assert/strict';
import {
  EARTH_RADIUS_METERS,
  findDistanceViolations,
  haversineDistanceMeters,
  isValidCoordinate,
} from '../src/utils/geoDistance.js';

const point = (id, latitude, longitude) => ({
  id,
  fileName: `${id}.jpg`,
  latitude,
  longitude,
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

const threeClose = findDistanceViolations([
  point('a', 64.588123, 30.601234),
  point('b', 64.5882, 30.6013),
  point('c', 64.58825, 30.60135),
], { thresholdMeters: 25 });
const pairs = new Set(threeClose.map((violation) => `${violation.pointAId}-${violation.pointBId}`));
assert.equal(pairs.size, threeClose.length);
assert.equal([...pairs].some((pairName) => pairName === 'b-a'), false);

const thresholdLongitude = (25 / EARTH_RADIUS_METERS) * (180 / Math.PI);
const exactlyThreshold = findDistanceViolations([
  point('a', 0, 0),
  point('b', 0, thresholdLongitude),
], { thresholdMeters: 25 });
assert.equal(exactlyThreshold.length, 0);

console.log('Geo distance tests passed');
