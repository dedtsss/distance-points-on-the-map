import assert from 'node:assert/strict';
import {
  FIXED_OVERLAY_PROFILE,
  parseFixedOverlayCoordinates,
  parseFixedOverlayIndex,
  relativeBoundsWithin,
} from '../src/features/gps/fixedOverlayOcr.js';

const coordinateFixtures = [
  ['64,607016N30,622840E+5,20m', 64.607016, 30.622840],
  ['64.607007 N 30,623571E +4,71m', 64.607007, 30.623571],
  ['o 4,606939N 30,624256E +5,19m', 64.606939, 30.624256],
  ['64 606930N 30,624859E +4,85m', 64.606930, 30.624859],
  ['64606930 N 30624859 E +4,85m', 64.606930, 30.624859],
  ['64.60 6868N 30,625749E 448m', 64.606868, 30.625749],
  ['64,606609N 30,6281 23E +4,58m', 64.606609, 30.628123],
];

for (const [rawText, latitude, longitude] of coordinateFixtures) {
  const parsed = parseFixedOverlayCoordinates(rawText);
  assert.ok(parsed, `Coordinates should parse: ${rawText}`);
  assert.equal(parsed.latitude, latitude);
  assert.equal(parsed.longitude, longitude);
}

assert.equal(parseFixedOverlayCoordinates('4.606939N 130.624256E'), null);
assert.equal(parseFixedOverlayCoordinates('random text'), null);
assert.equal(parseFixedOverlayIndex('6369'), '6369');
assert.equal(parseFixedOverlayIndex(' 6371\n'), '6371');
assert.equal(parseFixedOverlayIndex('6371 6381'), null);

const overlayBounds = { x: 1685, y: 2984, width: 763, height: 280 };
assert.deepEqual(relativeBoundsWithin(overlayBounds, FIXED_OVERLAY_PROFILE.coordinates), {
  x: 1685,
  y: 2984,
  width: 763,
  height: 118,
});
assert.deepEqual(relativeBoundsWithin(overlayBounds, FIXED_OVERLAY_PROFILE.index), {
  x: 2158,
  y: 3110,
  width: 290,
  height: 84,
});

console.log('Fixed overlay OCR profile tests passed.');
