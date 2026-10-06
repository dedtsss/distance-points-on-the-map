import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readPhoto } from '../src/core/readPhoto.js';
import { splitBatch } from '../src/core/batch.js';
import { findDistanceViolations, haversineDistanceMeters } from '../src/core/utils/geoDistance.js';
import { parseFixedOverlayIndex } from '../src/core/features/gps/fixedOverlayOcr.js';
import { getOcrAssetRuntimeOptions, parseGpsFromOcrText, OCR_ATTEMPT_VARIANTS } from '../src/core/utils/ocrGpsReader.js';
import { formatPhotoResultBlock } from '../src/core/features/export/resultBlockFormatter.js';
import { copyResultBlocks, gpxFilename, textFilename } from '../src/androidText.js';
import { buildDistancePairs, buildResultText } from '../src/resultSummary.js';
import { buildGpx, resultBlocksForCopy } from '../src/resultExports.js';
import { outgoingName, publishBatch } from '../src/publishBatch.js';
import { DEFAULT_NINJABOX_RELAY_URL, onionBaseUrl, publishCleanImage, ninjaboxRelayUrl, publishCleanImageToNinjabox } from '../src/core/publisher.js';
import { selectUpdate } from '../src/update.js';
import { handleNinjaboxRelay, isSanitizedJpeg } from '../relay/worker.js';
import { parseNativeStamp, mergeNativePasses } from '../src/nativeOcr.js';

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
  assert.equal(formatPhotoResultBlock({ indexFromOcr: '6301', coordinates: { latitude: 64, longitude: 30 } }, { session: '17 Север' }).split('\n')[0], '#6301 / 17 Север');
  assert.equal(textFilename('17 Север'), 'DarkFotoResult_17_Север.txt');
  assert.equal(textFilename('  /опасно:*?  '), 'DarkFotoResult_опасно.txt');
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
  assert.equal(result.unresolved[0].reviewReason, 'index_missing');
  assert.equal(result.unresolved[1].reviewReason, 'coordinates_missing');
});

test('6301 single photo and same-coordinate 6300/6301/6302 are eligible', () => {
  const recognized = (index, id) => ({ id, number: Number(id),
    ...parseNativeStamp({ text: '64.581207N 30.597531E', lines: [
      { text: '64.581207N 30.597531E', topRatio: 0.25 },
      { text: `Номер индекса: ${index}`, topRatio: 0.8 },
    ] }),
  });
  const rows = ['6300', '6301', '6302'].map((index, position) => {
    const parsed = recognized(index, String(position + 1));
    return { ...parsed, coordinates: { latitude: parsed.latitude, longitude: parsed.longitude },
      gpsSource: 'ocr', gpsConfidence: parsed.confidence, coordinateQuality: 'confident' };
  });
  const single = splitBatch([rows[1]]);
  assert.deepEqual([single.main.length, single.reserve.length, single.unresolved.length], [1, 0, 0]);
  const batch = splitBatch(rows);
  assert.deepEqual([batch.main.length, batch.reserve.length, batch.unresolved.length], [1, 2, 0]);
  assert.equal(batch.remainingConflicts.length, 0);
});

test('native stamp index policy rejects date, time, coordinate fragments and multiple values', () => {
  const stamp = (lines) => parseNativeStamp({ text: '64.581207N 30.597531E', lines });
  for (const value of ['12.09.2025', '12:34', '30.597531E', '2025-10-02', '2025']) {
    assert.equal(stamp([{ text: value, topRatio: 0.8 }]).indexStatus, 'missing');
  }
  assert.equal(stamp([{ text: '6301', topRatio: 0.2 }]).indexStatus, 'missing');
  assert.equal(stamp([{ text: '6300', topRatio: 0.8 }, { text: '6301', topRatio: 0.9 }]).indexStatus, 'missing');
  assert.equal(stamp([{ text: '6301', topRatio: 0.8 }]).indexStatus, 'found');
  assert.equal(parseNativeStamp({ profile: 'black', text: '64.581207N 30.597531E',
    lines: [{ text: 'HOMep uHdekca: 6301', topRatio: 0.8 }] }).indexStatus, 'found');
  assert.equal(mergeNativePasses(stamp([{ text: '6300', topRatio: 0.8 }]),
    stamp([{ text: '6301', topRatio: 0.8 }])).indexStatus, 'uncertain');
});

test('explicit NinjaBox route accepts only per-photo viewer links and never falls back', async () => {
  const jpeg = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 2, 0xff, 0xda, 0, 0, 0xff, 0xd9])], 'clean.jpg', { type: 'image/jpeg' });
  assert.equal(isSanitizedJpeg(new Uint8Array(await jpeg.arrayBuffer())), true);
  assert.equal(isSanitizedJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 2, 0xff, 0xda, 0, 0, 0])), false);
  assert.equal(ninjaboxRelayUrl('https://relay.example/v1/ninjabox'), 'https://relay.example/v1/ninjabox');
  assert.equal(ninjaboxRelayUrl(DEFAULT_NINJABOX_RELAY_URL), DEFAULT_NINJABOX_RELAY_URL);
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

test('result TXT omits pairwise distances but conflict grouping remains', () => {
  const photos = ['6300', '6301', '6302'].map((index, position) => ({
    id: String(position + 1), number: position + 1, fileName: `${index}.jpg`,
    indexFromOcr: index, indexStatus: 'found',
    coordinates: { latitude: 64.581207, longitude: 30.597531 },
    gpsStatus: 'done', gpsSource: 'ocr', coordinateQuality: 'confident',
    ocrStatus: 'confident', gpsConfidence: 0.99,
  }));
  const grouped = splitBatch(photos);
  const pairs = buildDistancePairs([...grouped.main, ...grouped.reserve], 25);
  assert.equal(pairs.length, 3);
  assert.ok(pairs.every((pair) => pair.distanceMeters === 0 && pair.tooClose));
  const text = buildResultText({
    grouped,
    session: '17',
    formatOptions: { session: '17' },
    reviewLabels: {},
  });
  assert.match(text, /^Сессия: 17/);
  assert.doesNotMatch(text, /Расстояния между точками|↔/);
  assert.match(text, /Основные[\s\S]*Резерв[\s\S]*Требует проверки/);
  assert.deepEqual([grouped.main.length, grouped.reserve.length], [1, 2]);
});

test('GPX and copy blocks include valid Main and Reserve in photo order', () => {
  const photo = (id, number, index, fileName) => ({ id, number, indexFromOcr: index,
    fileName, coordinates: { latitude: 64.581207, longitude: 30.597531 } });
  const grouped = {
    main: [photo('3', 3, '6302', 'three.jpg'), photo('1', 1, '6300', 'one.jpg')],
    reserve: [photo('2', 2, '6301', 'two & <bad>.jpg')],
    unresolved: [photo('4', 4, '6303', 'review.jpg')],
  };
  const blocks = resultBlocksForCopy(grouped, { session: '17 & Север' });
  assert.deepEqual(blocks.map((block) => block.split('\n')[0]),
    ['#6300 / 17 & Север', '#6301 / 17 & Север', '#6302 / 17 & Север']);
  const gpx = buildGpx(grouped, '17 & Север');
  assert.deepEqual([...gpx.matchAll(/<name>(.*?)<\/name>/g)].map((match) => match[1]),
    ['#6300 / 17 &amp; Север', '#6301 / 17 &amp; Север', '#6302 / 17 &amp; Север']);
  assert.equal((gpx.match(/<wpt /g) || []).length, 3);
  assert.match(gpx, /<wpt lat="64\.581207" lon="30\.597531">/);
  assert.match(gpx, /two &amp; &lt;bad&gt;\.jpg/);
  assert.doesNotMatch(gpx, /review\.jpg/);
  assert.match(buildGpx({ main: [photo('1', 1, '6300', 'one.jpg')], reserve: [] }), /<name>#6300<\/name>/);
  assert.equal(gpxFilename('17 Север'), 'DarkFotoResult_17_Север.gpx');
});

test('NinjaBox timeout aborts even if transport does not settle', async () => {
  const jpeg = new File(['jpeg'], 'clean.jpg', { type: 'image/jpeg' });
  let signal;
  await assert.rejects(publishCleanImageToNinjabox(jpeg, DEFAULT_NINJABOX_RELAY_URL, {
    timeoutMs: 15,
    fetch: (_url, request) => { signal = request.signal; return new Promise(() => {}); },
  }), /тайм-аут/);
  assert.equal(signal.aborted, true);
});

test('publication stages and links map to source photos; failure stops with visible errors', async () => {
  const rows = [1, 2, 3, 4].map((number) => ({ id: String(number), number,
    uploadResult: { links: [] } }));
  const stages = [];
  let visibleRows = [];
  const result = await publishBatch(rows, new Set(['4']), {
    publisher: 'ninjabox', destination: DEFAULT_NINJABOX_RELAY_URL,
    fileAt: async (index) => new File(['source'], `${index}.jpg`, { type: 'image/jpeg' }),
    clean: async (_file, options) => ({ ok: true, file: new File(['clean'], options.preferredFilename, { type: 'image/jpeg' }) }),
    publishNinjabox: async (_file) => {
      if (stages.at(-1) === 'NinjaBox 2/4') throw new Error('NinjaBox: тайм-аут 90 с');
      return 'https://ninjabox.org/i/first';
    },
    onStatus: (stage) => stages.push(stage),
    onRows: (updated) => { visibleRows = updated; },
  });
  assert.deepEqual(stages, ['Очистка 1/4', 'NinjaBox 1/4', 'Очистка 2/4', 'NinjaBox 2/4']);
  assert.equal(rows[0].uploadResult.links[0].url, 'https://ninjabox.org/i/first');
  assert.match(rows[1].publishError, /тайм-аут/);
  assert.match(rows[2].publishError, /остановлен/);
  assert.match(rows[3].publishError, /остановлен/);
  assert.deepEqual(visibleRows, rows);
  assert.deepEqual(result, { failures: 1, stopped: true });
});

test('successful NinjaBox responses map to each eligible photo', async () => {
  const rows = [1, 2].map((number) => ({ id: String(number), number, uploadResult: { links: [] } }));
  const progress = [];
  const result = await publishBatch(rows, new Set(), {
    publisher: 'ninjabox', destination: DEFAULT_NINJABOX_RELAY_URL,
    fileAt: async () => new File(['source'], 'source.jpg', { type: 'image/jpeg' }),
    clean: async () => ({ ok: true, file: new File(['clean'], 'clean.jpg', { type: 'image/jpeg' }) }),
    publishNinjabox: async (_file, _destination, options) => {
      options.onProgress(5, 10);
      return `https://ninjabox.org/i/${rows.find((row) => !row.uploadResult.links.length).id}`;
    },
    onProgress: (...values) => progress.push(values),
  });
  assert.deepEqual(rows.map((row) => row.uploadResult.links[0].url),
    ['https://ninjabox.org/i/1', 'https://ninjabox.org/i/2']);
  assert.deepEqual(result, { failures: 0, stopped: false });
  assert.deepEqual(progress, [
    ['cleanup', 0, 2], ['ninjabox', 0, 2], ['ninjabox', 0, 2, .5],
    ['ninjabox', 1, 2], ['cleanup', 1, 2],
    ['ninjabox', 1, 2], ['ninjabox', 1, 2, .5], ['ninjabox', 2, 2],
  ]);
});

test('NinjaBox resumes a saved 8/14 manifest without uploading completed photos', async () => {
  const rows = Array.from({ length: 14 }, (_, index) => ({ id: String(index + 1), number: index + 1,
    indexFromOcr: String(6800 + index), indexStatus: 'found', uploadResult: { links: index < 8
      ? [{ provider: 'ninjabox', url: `https://ninjabox.org/i/existing-${index}` }] : [] } }));
  const restored = JSON.parse(JSON.stringify(rows));
  const uploaded = [];
  let manifest = JSON.stringify(restored);
  await publishBatch(restored, new Set(), {
    publisher: 'ninjabox', destination: DEFAULT_NINJABOX_RELAY_URL,
    fileAt: async (index) => new File(['source'], `IMG_${index}.jpg`, { type: 'image/jpeg' }),
    clean: async (_file, { preferredFilename }) => ({ ok: true,
      file: new File(['clean'], preferredFilename, { type: 'image/jpeg' }) }),
    publishNinjabox: async (file) => { uploaded.push(file.name); return `https://ninjabox.org/i/new-${uploaded.length}`; },
    onRows: async (updated) => { manifest = JSON.stringify(updated); },
  });
  assert.deepEqual(uploaded, ['6808.jpg', '6809.jpg', '6810.jpg', '6811.jpg', '6812.jpg', '6813.jpg']);
  assert.equal(JSON.parse(manifest).filter((row) => row.uploadResult.links.length).length, 14);
  assert.equal(restored[0].uploadResult.links[0].url, 'https://ninjabox.org/i/existing-0');
});

test('unresolved photos publish with ordered NN names and stay in Review', async () => {
  const rows = [
    { id: '1', number: 1, indexFromOcr: '6886', indexStatus: 'found', uploadResult: { links: [] } },
    { id: '2', number: 2, indexFromOcr: '6887', indexStatus: 'found', uploadResult: { links: [] } },
    { id: '3', number: 3, indexFromOcr: null, indexStatus: 'missing', uploadResult: { links: [] } },
    { id: '4', number: 4, indexFromOcr: null, indexStatus: 'missing', uploadResult: { links: [] } },
  ];
  assert.equal(outgoingName(rows[0], 0), '6886.jpg');
  assert.equal(outgoingName(rows[2], 1), 'NN01.jpg');
  assert.equal(outgoingName(rows[3], 101), 'NN101.jpg');
  const names = [];
  await publishBatch(rows, new Set(['2', '3', '4']), {
    publisher: 'ninjabox', destination: DEFAULT_NINJABOX_RELAY_URL,
    fileAt: async (index) => new File(['source'], `IMG_20261005_${index}.jpg`, { type: 'image/jpeg' }),
    clean: async (_file, { preferredFilename }) => ({ ok: true,
      file: new File(['clean'], preferredFilename, { type: 'image/jpeg' }) }),
    publishNinjabox: async (file) => { names.push(file.name); return `https://ninjabox.org/i/${names.length}`; },
  });
  assert.deepEqual(names, ['6886.jpg', '6887.jpg', 'NN01.jpg', 'NN02.jpg']);
  assert.equal(rows[3].uploadResult.links.length, 1);
  assert.equal(splitBatch(rows).unresolved.length, 4);
});

test('Main and Reserve clipboard groups emit separate per-block writes', async () => {
  const item = (id, number, indexFromOcr) => ({ id, number, indexFromOcr,
    coordinates: { latitude: 64.581207, longitude: 30.597531 } });
  const grouped = { main: [item('1', 1, '6300'), item('2', 2, '6301')],
    reserve: [item('3', 3, '6302')] };
  const writes = [];
  const write = async (block) => { writes.push(block); };
  await copyResultBlocks(resultBlocksForCopy({ main: grouped.main, reserve: [] }), () => {}, write);
  assert.deepEqual(writes.map((block) => block.split('\n')[0]), ['#6300', '#6301']);
  writes.length = 0;
  await copyResultBlocks(resultBlocksForCopy({ main: [], reserve: grouped.reserve }), () => {}, write);
  assert.deepEqual(writes.map((block) => block.split('\n')[0]), ['#6302']);
});

test('About picks only a newer public DarkFoto APK release', () => {
  const release = (version, digest = '') => ({ tag_name: `darkfoto-v${version}`, assets: [{ name: 'darkfoto.apk',
    browser_download_url: `https://github.com/dedtsss/distance-points-on-the-map/releases/download/darkfoto-v${version}/darkfoto.apk`, digest }] });
  assert.deepEqual(selectUpdate([release('0.1.2'), release('0.2.0', `sha256:${'a'.repeat(64)}`)], '0.1.2'), {
    version: '0.2.0', url: 'https://github.com/dedtsss/distance-points-on-the-map/releases/download/darkfoto-v0.2.0/darkfoto.apk',
    sha256: 'a'.repeat(64),
  });
  assert.equal(selectUpdate([release('0.1.2')], '0.2.0'), null);
  assert.equal(selectUpdate([release('0.3.6')], '0.3.5'), null);
});
