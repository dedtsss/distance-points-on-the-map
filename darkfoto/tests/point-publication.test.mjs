import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupPhotos, splitPoint, mergePoint } from '../src/core/photoPoints.js';
import { publishBatch } from '../src/publishBatch.js';
import { publishCleanImageToNinjabox } from '../src/core/publisher.js';
import { handleNinjaboxRelay } from '../relay/worker.js';
import { MAX_JPEG_BYTES, MAX_POINT_BYTES, MAX_POINT_FILES, validatePointFiles } from '../src/core/ninjaboxContract.js';
import { validateRecovery } from '../src/recovery.js';
import { splitBatch } from '../src/core/batch.js';
import { buildGpx, resultBlocksForCopy } from '../src/resultExports.js';
import { buildResultText } from '../src/resultSummary.js';

const galleryUrl = 'https://ninjabox.org/ed8ae0b8-9373-4dc0-a454-99e5f57a0578';
const relay = 'https://relay.example/v1/ninjabox';
const jpeg = (name = '6886-01.jpg') => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 2, 0xff, 0xda, 0, 0, 0xff, 0xd9])], name, { type: 'image/jpeg' });
const post = (files) => {
  const form = new FormData();
  files.forEach((file) => form.append('file', file, file.name));
  return new Request(relay, { method: 'POST', body: form });
};
const provider = (count = 2, gallery = galleryUrl) => ({ ok: true, galleryUrl: gallery,
  items: Array.from({ length: count }, (_, index) => ({ url: `https://ninjabox.org/i/member-${index}` })) });
const photos = () => Array.from({ length: 10 }, (_, i) => ({ id: String(i + 1), number: i + 1,
  fileName: `private-${i}.jpg`, indexFromOcr: String(6880 + i), indexStatus: 'found',
  coordinates: { latitude: 64, longitude: 30 + (i < 3 ? 0 : i * .001) },
  coordinateQuality: 'confident', gpsSource: 'exif', gpsStatus: 'done',
  captureTimeMs: 1_700_000_000_000 + i * 1000, captureTimeSource: 'exif', uploadResult: { links: [] } }));

test('relay sends one group batch through reusable uploader and exposes only common gallery', async () => {
  let calls = 0;
  const response = await handleNinjaboxRelay(post([jpeg(), jpeg('6886-02.jpg')]), async (files) => {
    calls++;
    assert.deepEqual(files.map((file) => file.name), ['6886-01.jpg', '6886-02.jpg']);
    return provider();
  });
  assert.equal(calls, 1);
  assert.deepEqual(await response.json(), { ok: true, galleryUrl, itemCount: 2 });
  assert.equal(await publishCleanImageToNinjabox([jpeg(), jpeg()], relay, {
    fetch: async (_url, request) => {
      assert.equal(request.body.getAll('file').length, 2);
      return handleNinjaboxRelay(new Request(relay, request), async () => provider());
    },
  }), galleryUrl);
});

test('relay rejects bad gallery/count/duplicate photo pages and every unsafe member before upload', async () => {
  for (const result of [provider(1), provider(2, 'https://elsewhere.example/gallery'),
    provider(2, 'https://ninjabox.org/i/member-0'), { ...provider(), items: provider().items.map(() => ({ url: 'https://ninjabox.org/i/same' })) }]) {
    assert.equal((await handleNinjaboxRelay(post([jpeg(), jpeg()]), async () => result)).status, 502);
  }
  const unsafe = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 2, 0xff, 0xda, 0, 0, 0])], 'original.jpg', { type: 'image/jpeg' });
  let uploads = 0;
  for (const files of [[jpeg(), unsafe], [jpeg(), new File(['x'], 'x.png', { type: 'image/png' })], []]) {
    assert.equal((await handleNinjaboxRelay(post(files), async () => { uploads++; return provider(); })).status, 400);
  }
  assert.equal(uploads, 0);
  const file = (size) => ({ type: 'image/jpeg', size });
  assert.equal(validatePointFiles([file(MAX_JPEG_BYTES + 1)]), false);
  assert.equal(validatePointFiles(Array(MAX_POINT_FILES + 1).fill(file(1))), false);
  assert.equal(validatePointFiles(Array(5).fill(file(MAX_POINT_BYTES / 4))), false);
  for (const body of [{ ok: true, galleryUrl, itemCount: 1 }, { ok: true, url: 'https://ninjabox.org/i/one' }, { ok: true, galleryUrl: `${galleryUrl}?x=1`, itemCount: 2 }]) {
    await assert.rejects(publishCleanImageToNinjabox([jpeg(), jpeg()], relay, { fetch: async () => Response.json(body) }), /неверную ссылку/);
  }
});

test('10 photos form 8 point entities, export blocks and GPX waypoints; restart skips completed gallery', async () => {
  const points = groupPhotos(photos());
  assert.equal(points.length, 8);
  const state = { files: photos().map((row) => ({ id: row.id })), rows: points, publisher: 'ninjabox', phase: 'publishing' };
  points[0].uploadResult = { links: [{ provider: 'ninjabox', url: galleryUrl }] };
  let manifest = JSON.stringify(state);
  const restored = validateRecovery(JSON.parse(manifest));
  const reads = [];
  const uploads = [];
  await publishBatch(restored.rows, new Set(), {
    publisher: 'ninjabox', destination: relay,
    fileAt: async (index) => { reads.push(index); return jpeg('source.jpg'); },
    clean: async (_file, { preferredFilename }) => ({ ok: true, file: jpeg(preferredFilename) }),
    publishNinjabox: async (file) => { uploads.push(file.name); return `https://ninjabox.org/i/new-${uploads.length}`; },
    onRows: async (rows) => { manifest = JSON.stringify({ ...restored, rows }); },
  });
  assert.deepEqual(reads, [3, 4, 5, 6, 7, 8, 9]);
  assert.equal(uploads.length, 7);
  assert.equal(restored.rows[0].uploadResult.links.length, 1);
  assert.equal(restored.rows[0].uploadResult.links[0].url, galleryUrl);
  assert.equal(JSON.parse(manifest).rows.filter((row) => row.uploadResult.links.length).length, 8);
  assert.equal(splitPoint(restored.rows, restored.rows[0].id), restored.rows);
  assert.equal(mergePoint(restored.rows, restored.rows[0].id, 1), restored.rows);
  const grouped = splitBatch(restored.rows);
  assert.equal(resultBlocksForCopy(grouped).length, 8);
  assert.equal((buildGpx(grouped).match(/<wpt /g) || []).length, 8);
  const txt = buildResultText({ grouped });
  assert.equal((txt.match(/^#/gm) || []).length, 8);
  assert.equal(txt.split(galleryUrl).length - 1, 1);
  assert.throws(() => validateRecovery({ ...restored, rows: restored.rows.slice(1) }), /invalid/);
});

test('a fresh multi-photo point uses numbered clean names and stores only one gallery link', async () => {
  const points = groupPhotos(photos().slice(0, 3));
  let calls = 0;
  await publishBatch(points, new Set(), {
    publisher: 'ninjabox', destination: relay,
    fileAt: async (index) => { assert.ok(index >= 0 && index < 3); return jpeg(); },
    clean: async (_file, { preferredFilename }) => ({ ok: true, file: jpeg(preferredFilename) }),
    publishNinjabox: async (files) => {
      calls++;
      assert.deepEqual(files.map((file) => file.name), ['6880-01.jpg', '6880-02.jpg', '6880-03.jpg']);
      return galleryUrl;
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(points[0].uploadResult.links, [{ provider: 'ninjabox', url: galleryUrl }]);
  assert.ok(points[0].members.every((member) => member.uploadResult.links.length === 0));
});

test('a failed member cleanup never publishes a partial gallery and NN groups retain one Review block', async () => {
  const members = photos().slice(0, 2).map((row) => ({ ...row, indexFromOcr: null, indexStatus: 'missing' }));
  const point = { ...groupPhotos(photos().slice(0, 2))[0], indexFromOcr: null, indexStatus: 'missing', members };
  let cleanCount = 0;
  let uploadCount = 0;
  await publishBatch([point], new Set(), {
    publisher: 'ninjabox', destination: relay, fileAt: async () => jpeg(),
    clean: async () => ++cleanCount === 2 ? { ok: false, error: 'unsafe metadata' } : { ok: true, file: jpeg() },
    publishNinjabox: async () => { uploadCount++; return galleryUrl; },
  });
  assert.equal(uploadCount, 0);
  assert.match(point.publishError, /unsafe metadata/);
  await publishBatch([point], new Set(), {
    publisher: 'ninjabox', destination: relay, fileAt: async () => jpeg(),
    clean: async (_file, { preferredFilename }) => ({ ok: true, file: jpeg(preferredFilename) }),
    publishNinjabox: async (files) => {
      assert.deepEqual(files.map((file) => file.name), ['NN01-01.jpg', 'NN01-02.jpg']);
      return galleryUrl;
    },
  });
  const grouped = splitBatch([point]);
  assert.equal(grouped.unresolved.length, 1);
  const txt = buildResultText({ grouped });
  assert.equal((txt.match(/^#/gm) || []).length, 1);
  assert.equal(txt.split(galleryUrl).length - 1, 1);
});

test('XHR validates the common gallery and expected item count for multi-photo points', async () => {
  const previous = globalThis.XMLHttpRequest;
  class FakeXHR {
    upload = {};
    responseURL = relay;
    status = 200;
    responseText = JSON.stringify({ ok: true, galleryUrl, itemCount: 2 });
    open() {}
    send(form) { assert.equal(form.getAll('file').length, 2); this.onload(); }
  }
  try {
    globalThis.XMLHttpRequest = FakeXHR;
    assert.equal(await publishCleanImageToNinjabox([jpeg(), jpeg()], relay, { onProgress: () => {} }), galleryUrl);
    FakeXHR.prototype.send = function () {
      this.responseText = JSON.stringify({ ok: true, galleryUrl, itemCount: 1 }); this.onload();
    };
    await assert.rejects(publishCleanImageToNinjabox([jpeg(), jpeg()], relay, { onProgress: () => {} }), /неверную ссылку/);
  } finally { globalThis.XMLHttpRequest = previous; }
});

test('legacy 0.3.6 recovery retains flat completed photos without regrouping', () => {
  const rows = photos();
  rows[0].uploadResult.links = [{ provider: 'ninjabox', url: 'https://ninjabox.org/i/existing' }];
  const restored = validateRecovery({ files: rows.map((row) => ({ id: row.id })), rows, publisher: 'ninjabox' });
  assert.equal(restored.rows.length, 10);
  assert.equal(restored.rows[0].members, undefined);
  assert.equal(restored.rows[0].uploadResult.links[0].url, 'https://ninjabox.org/i/existing');
});
