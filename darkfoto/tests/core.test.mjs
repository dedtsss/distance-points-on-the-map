import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readPhoto } from '../src/core/readPhoto.js';
import { splitBatch } from '../src/core/batch.js';
import { findDistanceViolations, haversineDistanceMeters } from '../src/core/utils/geoDistance.js';
import { parseFixedOverlayIndex } from '../src/core/features/gps/fixedOverlayOcr.js';
import { getOcrAssetRuntimeOptions, parseGpsFromOcrText, OCR_ATTEMPT_VARIANTS } from '../src/core/utils/ocrGpsReader.js';
import { formatPhotoResultBlock } from '../src/core/features/export/resultBlockFormatter.js';
import { onionBaseUrl, publishCleanImage, ninjaboxRelayUrl, publishCleanImageToNinjabox } from '../src/core/publisher.js';
import { selectUpdate } from '../src/update.js';
import { handleNinjaboxRelay, isSanitizedJpeg } from '../relay/worker.js';

test('Android OCR requests unpacked traineddata while browser keeps gzip', () => {
  assert.equal(getOcrAssetRuntimeOptions('android').gzip, false);
  assert.equal(getOcrAssetRuntimeOptions('web').gzip, true);
});

test('leading zero and coordinate decimal formats survive parsing', () => {
  assert.equal(parseFixedOverlayIndex('0123'), '0123');
  assert.equal(parseFixedOverlayIndex('1234'), '1234');
  assert.equal(parseGpsFromOcrText('64.123456 N 30.123456 E').ok, true);
  assert.equal(parseGpsFromOcrText('64,123456 N 30,123456 E').ok, true);
  assert.ok(OCR_ATTEMPT_VARIANTS.every((variant) => variant.cropName !== 'full_image'));
});

test('valid EXIF wins, OCR still supplies index', async () => {
  const result = await readPhoto({}, {
    readExif: async () => ({ coordinates: { latitude: 64.1, longitude: 30.1 }, orientation: 1 }),
    readOcr: async () => ({ ok: true, latitude: 65.2, longitude: 31.2, indexFromOcr: '0123', indexStatus: 'found' }),
  });
  assert.deepEqual(result.coordinates, { latitude: 64.1, longitude: 30.1 });
  assert.equal(result.indexFromOcr, '0123');
  assert.equal(result.gpsSource, 'exif');
});

test('25 m boundary and minimum conflict cover are deterministic', () => {
  const oneMeterLon = 180 / (Math.PI * 6_371_000);
  const a = { latitude: 0, longitude: 1 };
  const b = { latitude: 0, longitude: 1 + 25 * oneMeterLon };
  assert.ok(Math.abs(haversineDistanceMeters(a, b) - 25) < 0.001);
  const at = (meters, id) => ({ id, coordinates: { latitude: 0, longitude: 1 + meters * oneMeterLon }, gpsStatus: 'done', gpsSource: 'exif', coordinateQuality: 'confident' });
  assert.equal(findDistanceViolations([at(0, 'a'), at(24.9, 'b')]).length, 1);
  assert.equal(findDistanceViolations([at(0, 'a'), at(25.1, 'b')]).length, 0);
  const photos = [0, 10, 30, 60].map((meters, index) => ({
    id: String(index), number: index + 1,
    indexFromOcr: String(index + 1000), indexStatus: 'found',
    coordinates: { latitude: 64, longitude: 30 + meters * oneMeterLon / Math.cos(64 * Math.PI / 180) },
    gpsStatus: 'done', gpsSource: 'exif', coordinateQuality: 'confident',
  }));
  const first = splitBatch(photos);
  const second = splitBatch(photos);
  assert.equal(first.reserve.length, 1);
  assert.equal(first.remainingConflicts.length, 0);
  assert.deepEqual(first.reserve.map((photo) => photo.id), second.reserve.map((photo) => photo.id));
});

test('result fields retain donor order and onion publisher refuses clearnet', async () => {
  assert.equal(formatPhotoResultBlock({ indexFromOcr: '0123', coordinates: { latitude: 64, longitude: 30 } }, { description: 'x' }).split('\n')[0], '#0123');
  assert.throws(() => onionBaseUrl('https://example.com'));
  assert.throws(() => onionBaseUrl('http://abc.onion'));
  const onion = `http://${'a'.repeat(56)}.onion/`;
  assert.equal(onionBaseUrl(onion), onion.slice(0, -1));
  await assert.rejects(publishCleanImage(new Blob(['x'], { type: 'image/jpeg' }), 'https://example.com'));
  let calls = 0;
  await assert.rejects(publishCleanImage(new Blob(['x'], { type: 'image/jpeg' }), onion, {
    fetch: async () => { calls += 1; throw new Error('Tor unavailable'); },
  }), /Tor unavailable/);
  assert.equal(calls, 1);
});

test('unresolved index or coordinates never enter Main, Reserve or distance checks', () => {
  const complete = { id: 'a', coordinates: { latitude: 64.1, longitude: 30.1 }, gpsSource: 'exif',
    coordinateQuality: 'confident', indexFromOcr: '0123', indexStatus: 'found' };
  const missingIndex = { ...complete, id: 'b', indexFromOcr: null, indexStatus: 'missing' };
  const missingCoordinates = { ...complete, id: 'c', coordinates: null };
  const result = splitBatch([complete, missingIndex, missingCoordinates]);
  assert.deepEqual(result.main.map((photo) => photo.id), ['a']);
  assert.equal(result.reserve.length, 0);
  assert.deepEqual(result.unresolved.map((photo) => photo.id), ['b', 'c']);
  assert.equal(result.remainingConflicts.length, 0);
});

test('explicit NinjaBox route accepts only per-photo viewer links and never falls back', async () => {
  const jpeg = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 2, 0xff, 0xda, 0, 0, 0xff, 0xd9])], 'clean.jpg', { type: 'image/jpeg' });
  assert.equal(isSanitizedJpeg(new Uint8Array(await jpeg.arrayBuffer())), true);
  assert.equal(isSanitizedJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 2, 0xff, 0xda, 0, 0, 0])), false);
  assert.equal(ninjaboxRelayUrl('https://relay.example/v1/ninjabox'), 'https://relay.example/v1/ninjabox');
  assert.throws(() => ninjaboxRelayUrl('http://relay.example/v1/ninjabox'));
  let calls = 0;
  const fetchMock = async (_url, request) => {
    calls += 1;
    assert.equal(request.method, 'POST');
    assert.equal(request.body.get('file').type, 'image/jpeg');
    return new Response(JSON.stringify({ ok: true, url: 'https://ninjabox.org/i/test123' }), { status: 200 });
  };
  assert.equal(await publishCleanImageToNinjabox(jpeg, 'https://relay.example/v1/ninjabox', { fetch: fetchMock }), 'https://ninjabox.org/i/test123');
  assert.equal(calls, 1);
  const form = new FormData();
  form.append('file', jpeg);
  const response = await handleNinjaboxRelay(new Request('https://relay.example/v1/ninjabox', { method: 'POST', body: form }),
    async () => ({ ok: true, items: [{ url: 'https://ninjabox.org/i/test123' }] }));
  assert.deepEqual(await response.json(), { ok: true, url: 'https://ninjabox.org/i/test123' });
});

test('About picks only a newer public DarkFoto APK release', () => {
  const release = (version, digest = '') => ({ tag_name: `darkfoto-v${version}`, assets: [{ name: 'darkfoto.apk',
    browser_download_url: `https://github.com/dedtsss/distance-points-on-the-map/releases/download/darkfoto-v${version}/darkfoto.apk`, digest }] });
  assert.deepEqual(selectUpdate([release('0.1.2'), release('0.2.0', `sha256:${'a'.repeat(64)}`)], '0.1.2'), {
    version: '0.2.0', url: 'https://github.com/dedtsss/distance-points-on-the-map/releases/download/darkfoto-v0.2.0/darkfoto.apk',
    sha256: 'a'.repeat(64),
  });
  assert.equal(selectUpdate([release('0.1.2')], '0.2.0'), null);
});
