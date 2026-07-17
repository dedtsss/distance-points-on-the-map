import assert from 'node:assert/strict';
import {
  chooseIndexCandidate,
  decimalPlaces,
  extractIndexCandidatesFromText,
  parseGpsFromOcrText,
  readGpsFromImageOcr,
  selectBestOcrAttempt,
} from '../src/utils/ocrGpsReader.js';

const assertCoordinates = (text, latitude, longitude) => {
  const result = parseGpsFromOcrText(text);

  assert.equal(result.ok, true, text);
  assert.equal(result.latitude, latitude, text);
  assert.equal(result.longitude, longitude, text);
  return result;
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
assertCoordinates('64,604344N30,591954E', 64.604344, 30.591954);
assertCoordinates('64.604344N30.591954E', 64.604344, 30.591954);
assertCoordinates('64,604344N 30,591954E +3.48m', 64.604344, 30.591954);
assertCoordinates('64,604344N 30,591954E 3,48m', 64.604344, 30.591954);
assertCoordinates('64,604344N 30,59 1954E +3 48m', 64.604344, 30.591954);
assertCoordinates('64,604344M 30,591954E', 64.604344, 30.591954);
assertCoordinates('64,604344N 30,591954£', 64.604344, 30.591954);
assertCoordinates('64,60271, 30,61999, 238,5м', 64.60271, 30.61999);
assertCoordinates('Меф/1гр/синяя упак/прикоп-заброс 64,60271, 30,61999, 238,5м', 64.60271, 30.61999);
assert.equal(
  parseGpsFromOcrText('64,60271, 30,61999, 238,5м').chosenCandidate.source,
  'karelia_pair_with_ignored_extra',
);

assert.equal(parseGpsFromOcrText('64,604344M 30,591954E').normalizedText, '64.604344N 30.591954E');
assert.equal(parseGpsFromOcrText('64,604344N 30,591954£').normalizedText, '64.604344N 30.591954E');
assert.equal(
  parseGpsFromOcrText('M 64,604344 30,591954 £').normalizedText,
  'M 64.604344 30.591954 £',
  'direction fixes must stay contextual',
);

assert.equal(parseGpsFromOcrText('61,792040N 34,323477E ±1,00m Номер индекса: 4469').indexFromOcr, '4469');
assert.equal(parseGpsFromOcrText('61,792040N 34,323477E ±1,00m Номер индекса: 4469').indexStatus, 'found');
assert.equal(parseGpsFromOcrText('61,792040N 34,323477E ±1,00m Номер индекса: 4468').indexFromOcr, '4468');
assert.equal(parseGpsFromOcrText('ООО Карелия Дом 30.10.2025 11:11 64.6028, 30.6258 (±4м)').indexFromOcr, null);
assert.equal(parseGpsFromOcrText('ООО Карелия Дом 30.10.2025 11:11 64.6028, 30.6258 (±4м)').indexStatus, 'missing');
assert.equal(parseGpsFromOcrText('000 Карелия Дом 30.10.2025 11:11 64.6028, 30.6258 (±4м)').indexFromOcr, null);
assert.equal(parseGpsFromOcrText('61,792040N 34,323477E +1,00 owe nnaeea: 4469 +o 4').indexFromOcr, '4469');
assert.equal(parseGpsFromOcrText('61,792040N 34,323477E +1,00 owe nnaeea: 4469 +o 4').indexStatus, 'uncertain');
assert.equal(parseGpsFromOcrText('61,792040N 34,323477E +1,00 oe nnaexea: 4468 #o 4A 6').indexFromOcr, '4468');
assert.equal(parseGpsFromOcrText('64,602311N 30,616222E +3,41 #ed #11 #ennana nax #on3a6oe oe nnaexea: 5130').indexFromOcr, '5130');
assert.equal(parseGpsFromOcrText('64,602502N 30,611988E +2,61 #ed #11 #ennsa nax #on3a6oe oe nnaeea: 5285').indexFromOcr, '5285');
assert.equal(parseGpsFromOcrText('64,604670N 30,591181E +2,39 oe nnaexea: 5917').indexFromOcr, '5917');
assert.equal(parseGpsFromOcrText('64,602214N 30,611359E +2,08 onen wxaexa: 5291').indexFromOcr, '5291');
assert.equal(parseGpsFromOcrText('64,601882N 30,615078E +3,44 #ed #11 #ennana nax #on3a6oe oe nnaexea: 5241').indexFromOcr, '5241');
assert.equal(parseGpsFromOcrText('Номер индекса: 5939').indexFromOcr, '5939');
assert.equal(parseGpsFromOcrText('Индекс: 5939').indexFromOcr, '5939');
assert.equal(parseGpsFromOcrText('Index: 5939').indexFromOcr, '5939');
assert.equal(parseGpsFromOcrText('IDX 5939').indexFromOcr, '5939');
assert.equal(parseGpsFromOcrText('№5939').indexFromOcr, '5939');
assert.equal(parseGpsFromOcrText('#5939').indexFromOcr, '5939');
assert.equal(parseGpsFromOcrText('Index: 5939').indexStatus, 'found');
assert.equal(parseGpsFromOcrText('64.123456, 30.123456 0123').indexFromOcr, '0123');
assert.equal(parseGpsFromOcrText('64.123456 N 30.123456 E 12345').indexFromOcr, '12345');
assert.equal(parseGpsFromOcrText('64.123456, 30.123456\n00042').indexFromOcr, '00042');
assert.equal(parseGpsFromOcrText('64.123456, 30.123456\n0000').indexFromOcr, '0000');
assert.equal(parseGpsFromOcrText('Index: OIBS').indexFromOcr, '0185');
assert.equal(parseGpsFromOcrText('64.123456, 30.123456\nO123').indexFromOcr, '0123');
assert.equal(parseGpsFromOcrText('64.123456, 30.123456\n№12345').indexFromOcr, '12345');
assert.equal(parseGpsFromOcrText('64.123456, 30.123456\nиндекс 4821').indexFromOcr, '4821');
assert.equal(parseGpsFromOcrText('64.123456, 30.123456\n123').indexFromOcr, null);
assert.equal(parseGpsFromOcrText('64.123456, 30.123456\n123456').indexFromOcr, null);
assert.equal(parseGpsFromOcrText('64.123456, 30.123456, 2379м').indexFromOcr, null);
assert.equal(parseGpsFromOcrText('64.123456, 30.123456').indexFromOcr, null);
assert.equal(parseGpsFromOcrText('Дата 2026-07-17 64.123456, 30.123456').indexFromOcr, null);

const repeatedIndex = chooseIndexCandidate([
  { value: '0123', source: 'index_ocr', attemptName: 'line:original', ocrConfidence: 0.61, score: 0.7, isolatedLine: true },
  { value: '0123', source: 'index_ocr', attemptName: 'line:threshold', ocrConfidence: 0.58, score: 0.68, isolatedLine: true },
]);
assert.equal(repeatedIndex.indexFromOcr, '0123');
assert.equal(repeatedIndex.indexStatus, 'found');
const weakSingleIndex = chooseIndexCandidate(extractIndexCandidatesFromText('12345', {
  source: 'index_ocr',
  ocrConfidence: 0.42,
  isolatedLine: true,
  attemptName: 'single_weak',
}));
assert.equal(weakSingleIndex.indexFromOcr, '12345');
assert.equal(weakSingleIndex.indexStatus, 'uncertain');

assert.equal(decimalPlaces('30,62000'), 5);
assert.equal(decimalPlaces('30.62'), 2);
const lowPrecision237 = assertCoordinates('64,60272, 30,62, 237,9м', 64.60272, 30.62);
assert.equal(lowPrecision237.coordinateQuality, 'low_precision');
assert.deepEqual(lowPrecision237.coordinatePrecision, { latitude: 5, longitude: 2 });
assert.deepEqual(lowPrecision237.coordinateText, { latitude: '64.60272', longitude: '30.62' });
assert.ok(lowPrecision237.warnings.includes('low_precision_coordinate'));
assert.equal(lowPrecision237.chosenCandidate.source, 'karelia_short_decimal_pair');
const lowPrecision238 = assertCoordinates('64,60272, 30,62, 238,0м', 64.60272, 30.62);
assert.equal(lowPrecision238.coordinateQuality, 'low_precision');
assert.ok(lowPrecision238.warnings.includes('low_precision_coordinate'));
const lowPrecisionDotted = assertCoordinates('64.60272, 30.62, 237.9m', 64.60272, 30.62);
assert.equal(lowPrecisionDotted.coordinateQuality, 'low_precision');
const lowPrecisionSpaced = assertCoordinates('64,60272 30,62 237,9м', 64.60272, 30.62);
assert.equal(lowPrecisionSpaced.coordinateQuality, 'low_precision');
const lowPrecisionPrefixed = assertCoordinates('Меф/1гр/синяя упак/прикоп-заброс 64,60272, 30,62, 238,0м', 64.60272, 30.62);
assert.equal(lowPrecisionPrefixed.coordinateQuality, 'low_precision');
assert.ok(lowPrecisionPrefixed.warnings.includes('low_precision_coordinate'));
assert.equal(lowPrecisionPrefixed.indexFromOcr, null);
assert.equal(parseGpsFromOcrText('41 Меф/1гр/синяя упак/прикоп-заброс 64,60272, 30,62, 237,9м').indexFromOcr, null);
const fullPrecisionWithTrailingZeros = assertCoordinates('64,60272, 30,62000, 238,0м', 64.60272, 30.62);
assert.equal(fullPrecisionWithTrailingZeros.coordinateQuality, null);
assert.deepEqual(fullPrecisionWithTrailingZeros.coordinatePrecision, { latitude: 5, longitude: 5 });
assert.deepEqual(fullPrecisionWithTrailingZeros.coordinateText, { latitude: '64.60272', longitude: '30.62000' });
assert.equal(fullPrecisionWithTrailingZeros.warnings.includes('low_precision_coordinate'), false);

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

let recognizeCalls = 0;
const lowPrecisionOcr = await readGpsFromImageOcr({ name: 'low-precision.jpg' }, {
  variants: [
    { name: 'first_low_precision', cropName: 'first', crop: {}, preprocess: { method: 'original' } },
    { name: 'second_should_not_run', cropName: 'second', crop: {}, preprocess: { method: 'original' } },
  ],
  dependencies: {
    loadImage: async () => ({ naturalWidth: 100, naturalHeight: 100 }),
    createSession: async () => ({ terminate: async () => {} }),
    crop: () => ({ width: 40, height: 12, sourceBounds: { x: 0, y: 0, width: 40, height: 12 } }),
    preprocess: (crop) => crop,
    recognize: async () => {
      recognizeCalls += 1;
      return { text: '64,6O272, 3O,62, 237,9м', confidence: 91 };
    },
  },
});
assert.equal(lowPrecisionOcr.ok, true);
assert.equal(lowPrecisionOcr.latitude, 64.60272);
assert.equal(lowPrecisionOcr.longitude, 30.62);
assert.equal(lowPrecisionOcr.ocrStatus, 'low_precision');
assert.equal(lowPrecisionOcr.coordinateQuality, 'low_precision');
assert.equal(lowPrecisionOcr.attempts.length, 1);
assert.equal(recognizeCalls, 1);

console.log('OCR parser tests passed');
