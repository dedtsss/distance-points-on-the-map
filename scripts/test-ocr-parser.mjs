import assert from 'node:assert/strict';
import { parseGpsFromOcrText, selectBestOcrAttempt } from '../src/utils/ocrGpsReader.js';

const assertCoordinates = (text, latitude, longitude) => {
  const result = parseGpsFromOcrText(text);

  assert.equal(result.ok, true, text);
  assert.equal(result.latitude, latitude, text);
  assert.equal(result.longitude, longitude, text);
};

assertCoordinates('64.588123, 30.601234', 64.588123, 30.601234);
assertCoordinates('Lat: 64.588123 Lon: 30.601234', 64.588123, 30.601234);
assertCoordinates('N 64.588123 E 30.601234', 64.588123, 30.601234);
assertCoordinates('LAT 62.123456 / LON 34.123456', 62.123456, 34.123456);
assertCoordinates('64.6O2319N 3O.6O9952E', 64.602319, 30.609952);
assertCoordinates('64.6S2319N 30.60B952E', 64.652319, 30.608952);
assertCoordinates('64,588123 30,601234', 64.588123, 30.601234);
assertCoordinates('мусор до 64.588123, 30.601234 мусор после', 64.588123, 30.601234);
assertCoordinates('64.6028, 30.6258 (±4м)', 64.6028, 30.6258);
assertCoordinates('61,792040N 34,323477E ±1,00m Номер индекса: 4469', 61.79204, 34.323477);
assertCoordinates('61,792040N 34,323477E ±1,00m Номер индекса: 4468', 61.79204, 34.323477);
assertCoordinates('64,604344N 30,591954E ±3,48m', 64.604344, 30.591954);
assertCoordinates('64.604344N 30.591954E', 64.604344, 30.591954);
assertCoordinates('64,604344 N 30,591954 E', 64.604344, 30.591954);
assertCoordinates('64.604344 N 30.591954 E', 64.604344, 30.591954);

assert.equal(parseGpsFromOcrText('61,792040N 34,323477E ±1,00m Номер индекса: 4469').indexFromOcr, '4469');
assert.equal(parseGpsFromOcrText('61,792040N 34,323477E ±1,00m Номер индекса: 4468').indexFromOcr, '4468');
assert.equal(parseGpsFromOcrText('ООО Карелия Дом 30.10.2025 11:11 64.6028, 30.6258 (±4м)').indexFromOcr, null);
assert.equal(parseGpsFromOcrText('000 Карелия Дом 30.10.2025 11:11 64.6028, 30.6258 (±4м)').indexFromOcr, null);
assert.equal(parseGpsFromOcrText('61,792040N 34,323477E +1,00 owe nnaeea: 4469 +o 4').indexFromOcr, '4469');
assert.equal(parseGpsFromOcrText('61,792040N 34,323477E +1,00 oe nnaexea: 4468 #o 4A 6').indexFromOcr, '4468');
assert.equal(parseGpsFromOcrText('64,602311N 30,616222E +3,41 #ed #11 #ennana nax #on3a6oe oe nnaexea: 5130').indexFromOcr, '5130');
assert.equal(parseGpsFromOcrText('64,602502N 30,611988E +2,61 #ed #11 #ennsa nax #on3a6oe oe nnaeea: 5285').indexFromOcr, '5285');
assert.equal(parseGpsFromOcrText('64,604670N 30,591181E +2,39 oe nnaexea: 5917').indexFromOcr, '5917');
assert.equal(parseGpsFromOcrText('64,602214N 30,611359E +2,08 onen wxaexa: 5291').indexFromOcr, '5291');
assert.equal(parseGpsFromOcrText('64,601882N 30,615078E +3,44 #ed #11 #ennana nax #on3a6oe oe nnaexea: 5241').indexFromOcr, '5241');
assertCoordinates('Меф/1гр/синяя упак/прикоп-заброс 64,60272, 30,62, 237,9м', 64.60272, 30.62);
assert.ok(parseGpsFromOcrText('Меф/1гр/синяя упак/прикоп-заброс 64,60272, 30,62, 237,9м').warnings.includes('low_precision_coordinate'));
assert.equal(parseGpsFromOcrText('Меф/1гр/синяя упак/прикоп-заброс 64,60272, 30,62, 237,9м').indexFromOcr, null);
assert.equal(parseGpsFromOcrText('41 Меф/1гр/синяя упак/прикоп-заброс 64,60272, 30,62, 237,9м').indexFromOcr, null);

const missing = parseGpsFromOcrText('строка без координат');
assert.equal(missing.ok, false);
assert.equal(missing.latitude, null);
assert.equal(missing.longitude, null);
assert.ok(missing.warnings.includes('coordinates_not_found'));
assert.deepEqual(missing.candidates, []);

const oneCoordinate = parseGpsFromOcrText('только широта 64.588123 без долготы');
assert.equal(oneCoordinate.ok, false);
assert.ok(oneCoordinate.warnings.includes('only_one_coordinate_found'));

const zeroZero = parseGpsFromOcrText('0.000000, 0.000000');
assert.equal(zeroZero.ok, false);
assert.equal(zeroZero.latitude, null);
assert.equal(zeroZero.longitude, null);
assert.ok(zeroZero.warnings.includes('zero_zero_placeholder'));

const lowConfidence = parseGpsFromOcrText('64.588123, 30.601234', { minimumConfidence: 0.99 });
assert.equal(lowConfidence.ok, false);
assert.ok(lowConfidence.warnings.includes('low_confidence'));

const swapped = parseGpsFromOcrText('30.601234 64.588123');
assert.equal(swapped.ok, true);
assert.equal(swapped.latitude, 64.588123);
assert.equal(swapped.longitude, 30.601234);
assert.ok(swapped.warnings.includes('coordinates_swapped'));
assert.ok(Array.isArray(swapped.candidates));
assert.ok(swapped.chosenCandidate);

const degreesMinutes = parseGpsFromOcrText('62°12.3456 N, 34°12.3456 E');
assert.equal(degreesMinutes.ok, true);
assert.ok(Math.abs(degreesMinutes.latitude - 62.20576) < 0.000001);
assert.ok(Math.abs(degreesMinutes.longitude - 34.20576) < 0.000001);

const degreesMinutesSeconds = parseGpsFromOcrText('62 12 34 N / 34 12 34 E');
assert.equal(degreesMinutesSeconds.ok, true);
assert.ok(Math.abs(degreesMinutesSeconds.latitude - 62.2094444444) < 0.000001);
assert.ok(Math.abs(degreesMinutesSeconds.longitude - 34.2094444444) < 0.000001);

const bestAttempt = selectBestOcrAttempt([
  {
    name: 'corrected-low-confidence', parserConfidence: 0.7, ocrConfidence: 0.7, correctionCount: 3,
    warnings: [], parsed: { ok: true, chosenCandidate: { latitude: 62.1, longitude: 34.1 } },
  },
  {
    name: 'directional-high-confidence', parserConfidence: 0.9, ocrConfidence: 0.8, correctionCount: 0,
    warnings: [], parsed: { ok: true, chosenCandidate: { latitude: 62.2, longitude: 34.2 } },
  },
]);
assert.equal(bestAttempt.name, 'directional-high-confidence');

console.log('OCR parser tests passed');
