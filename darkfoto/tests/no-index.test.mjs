import assert from 'node:assert/strict';
import { test } from 'node:test';
import { noIndex18 } from './fixtures/no-index-18.mjs';
import { readPhoto } from '../src/core/readPhoto.js';
import { groupPhotos, GROUP_DEFAULTS, makePoint, selectRepresentative, moveMember, removeMember, restoreLastMember, appendPhotos, splitPoint, mergePoint } from '../src/core/photoPoints.js';
import { splitBatch } from '../src/core/batch.js';
import { haversineDistanceMeters } from '../src/core/utils/geoDistance.js';
import { parseGpsFromOcrText } from '../src/core/utils/ocrGpsReader.js';
import { parseNativeStamp } from '../src/nativeOcr.js';
import { parseAccuracy } from '../src/core/captureTime.js';
import { buildResultText } from '../src/resultSummary.js';
import { buildGpx, buildPointGpx, resultBlocksForCopy, validResultPhotos } from '../src/resultExports.js';
import { localSessionPlan } from '../src/localSessionExport.js';
import { sessionMapPoints } from '../src/sessionMap.js';

const mode = { indexMode: false };
const analyze = (points) => splitBatch(points, 25, mode);
const groups = () => groupPhotos(noIndex18, GROUP_DEFAULTS, mode);

test('EXIF-first: OFF skips all OCR; ON reads index but EXIF wins even over low precision OCR noise', async () => {
  let calls = 0;
  const options = { ...mode, readExif: async () => ({ coordinates: noIndex18[0].coordinates,
    orientation: 6, DateTimeOriginal: '2026:01:01 12:00:00' }),
  readOcr: async () => { calls++; return { ok: true, latitude: 10, longitude: 10, coordinateQuality: 'low_precision',
    warnings: ['low_precision_coordinate'], indexFromOcr: '6880', indexStatus: 'found' }; } };
  const off = await readPhoto({ name: 'synthetic.jpg' }, options);
  assert.equal(calls, 0);
  assert.equal(off.gpsSource, 'exif');
  assert.equal(off.ocrEngine, 'skipped');
  assert.equal(off.indexFromOcr, null);
  assert.equal(off.indexStatus, 'disabled');
  assert.equal(off.orientation, 6);
  assert.equal(off.captureTimeMs, Date.UTC(2026, 0, 1, 12));
  const on = await readPhoto({ name: 'synthetic.jpg' }, { ...options, indexMode: true });
  assert.equal(calls, 1);
  assert.deepEqual(on.coordinates, off.coordinates);
  assert.equal(on.indexFromOcr, '6880');
  assert.equal(splitBatch([{ ...on, id: '1', number: 1 }]).main.length, 1);
});

test('no-index decimal comma/dot + altitude fallback: no invented index/accuracy/warning', async () => {
  for (const separator of [',', '.']) {
    const text = '1 г. описание\n64.12345 30.54321 225.0м'.replaceAll('.', separator);
    const parsed = parseGpsFromOcrText(text);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.latitude, 64.12345);
    assert.equal(parsed.longitude, 30.54321);
    assert.equal(parsed.indexFromOcr, null);
    assert.equal(parseAccuracy(text), null);
    for (const profile of ['black', 'gray']) {
      const native = parseNativeStamp({ text, profile, lines: [{ text: text.split('\n')[1], topRatio: .8 }] });
      assert.equal(native.ok, true);
      assert.equal(native.indexFromOcr, null);
      assert.equal(native.accuracyMeters, null);
    }
    for (const coordinates of [null, { latitude: 999, longitude: 30 }]) {
      let called = false;
      const read = await readPhoto({ name: 'synthetic.jpg' }, { ...mode,
        readExif: async () => ({ coordinates }), readOcr: async (_file, options) => {
          called = true; assert.equal(options.indexMode, false); assert.equal(options.skipIndexOcr, true);
          return { ...parsed, ocrStatus: 'confident', warnings: ['index_not_found'] };
        } });
      assert.equal(called, true);
      assert.equal(read.gpsSource, 'ocr');
      assert.equal(read.accuracyMeters, null);
      assert.deepEqual(read.warnings, []);
      assert.equal(analyze([{ ...read, id: '1', number: 1 }]).unresolved.length, 0);
    }
  }
});

test('synthetic 18 -> exactly 9 points; multi-minute EXIF groups stay together and 9 m pair stays distinct', () => {
  const points = groups();
  assert.equal(noIndex18.length, 18);
  assert.equal(points.length, 9);
  assert.deepEqual(points.map((p) => p.members.length), [3, 2, 1, 2, 3, 1, 2, 2, 2]);
  assert.ok(haversineDistanceMeters(points[0], points[1]) > 3);
  assert.ok(haversineDistanceMeters(points[0], points[1]) < 25);
  assert.deepEqual(groupPhotos([...noIndex18].reverse(), GROUP_DEFAULTS, mode), points);
  const batch = analyze(points);
  assert.equal(batch.unresolved.length, 0);
  assert.equal(batch.main.length, 8);
  assert.equal(batch.reserve.length, 1);
  assert.equal(batch.reserve[0].reserveConflicts[0].otherLabel, 'Точка 1');
  assert.equal(validResultPhotos(batch).length, 9);
  assert.equal(resultBlocksForCopy(batch).length, 9);
  assert.match(buildResultText({ grouped: batch, session: 'Синтетика', formatOptions: { session: 'Синтетика' } }), /Точка 1 \/ Синтетика/);
  assert.doesNotMatch(buildResultText({ grouped: batch }), /не распознан|Индекс|index_/);
  assert.equal((buildGpx(batch).match(/<wpt /g) || []).length, 9);
  assert.match(buildPointGpx(points[0], '', mode), /<name>Точка 1<\/name>/);
  const statuses = new Map([...batch.main.map((p) => [p.id, 'main']), ...batch.reserve.map((p) => [p.id, 'reserve'])]);
  const markers = sessionMapPoints(points, new Map(validResultPhotos(batch).map((p) => [p.id, p])),
    (p) => ({ kind: statuses.get(p.id) }), (p) => `Точка ${p.number}`);
  assert.equal(markers.length, 9);
  assert.equal(markers.filter((p) => p.status.kind === 'reserve').length, 1);
  assert.ok(localSessionPlan(points, mode).points.every((p) => !p.text.includes('Требует проверки')));
  // Index mode remains opt-in and still requires real indexes.
  assert.equal(splitBatch(points).unresolved.length, 9);
});

test('no-index OCR keeps strict time/space safeguards and never uses incidental digits', () => {
  const pair = noIndex18.slice(0, 2).map((p) => ({ ...p, gpsSource: 'ocr', indexFromOcr: '6880', indexStatus: 'found' }));
  assert.equal(groupPhotos(pair, GROUP_DEFAULTS, mode).length, 2);
  assert.equal(groupPhotos(pair.map((p, i) => ({ ...p, captureTimeMs: pair[0].captureTimeMs + i * 1000 })), GROUP_DEFAULTS, mode).length, 1);
});

test('manual representative updates analysis/map/TXT/GPX/local export, survives edits and falls back without duplicate ownership', () => {
  const a = { ...noIndex18[0], coordinates: { latitude: 64, longitude: 30 } };
  const b = { ...noIndex18[1], coordinates: { latitude: 64.00001, longitude: 30 } };
  const c = { ...noIndex18[3], coordinates: { latitude: 64.00023, longitude: 30 } };
  let points = [makePoint([a, b]), makePoint([c])];
  const id = points[0].id;
  assert.equal(analyze(points).reserve.length, 0);
  points = selectRepresentative(points, id, b.id);
  assert.deepEqual(points[0].coordinates, b.coordinates);
  assert.equal(points[0].manualRepresentativeId, b.id);
  assert.equal(analyze(points).reserve.length, 1);
  assert.match(buildResultText({ grouped: analyze(points) }), /Координаты: 64\.00001, 30/);
  assert.match(buildGpx(analyze(points)), /lat="64\.00001"/);
  assert.match(localSessionPlan(points, mode).points[0].text, /Координаты: 64\.00001, 30/);
  const marker = sessionMapPoints(points, new Map(), () => ({ kind: 'main' }), (p) => `Точка ${p.number}`)[0];
  assert.equal(marker.latitude, b.coordinates.latitude);
  points = appendPhotos(points, [{ ...noIndex18[2], coordinates: b.coordinates }], GROUP_DEFAULTS, mode);
  assert.equal(points[0].representativeId, b.id);
  points = removeMember(points, id, a.id);
  assert.equal(points[0].representativeId, b.id);
  points = restoreLastMember(points, id);
  assert.equal(points[0].representativeId, b.id);
  points = moveMember(points, id, a.id, points[1].id);
  assert.equal(points[0].representativeId, b.id);
  points = moveMember(points, id, b.id, points[1].id);
  assert.equal(points[0].representativeId, '3');
  assert.equal(points[0].manualRepresentativeId, null);
  const owned = points.flatMap((p) => p.emptyFromMove ? [] : p.members.map((m) => m.id));
  assert.equal(new Set(owned).size, owned.length);
  let removed = removeMember(selectRepresentative([makePoint([a, b])], id, b.id), id, b.id);
  assert.equal(removed[0].representativeId, a.id);
  removed = restoreLastMember(removed, id);
  assert.equal(removed[0].representativeId, a.id, 'normal deterministic fallback remains after restore');
  const split = splitPoint(selectRepresentative([makePoint([a, b])], id, b.id), id);
  assert.equal(split[1].manualRepresentativeId, b.id);
  assert.equal(mergePoint(split, split[0].id, 1)[0].representativeId, b.id);
});
