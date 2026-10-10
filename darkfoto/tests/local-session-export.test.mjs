import assert from 'node:assert/strict';
import { test } from 'node:test';
import { File } from 'node:buffer';
import { localSessionPlan, exportLocalSession, safeDirectory } from '../src/localSessionExport.js';
import { makePoint, moveMember, removeMember, restoreLastMember, appendPhotos } from '../src/core/photoPoints.js';
const photo = (number, extra = {}) => ({ id: String(number), number, indexFromOcr: '6950', indexStatus: 'found',
  coordinates: { latitude: 64, longitude: 30 }, coordinateQuality: 'confident', gpsSource: 'exif',
  accuracyMeters: number, captureTimeMs: 1700000000000 + number * 1000, captureTimeSource: 'exif',
  uploadResult: { links: [{ url: 'https://private.example/old' }] }, ...extra });
const metadata = { session: 'Север / 2', color: 'Синий', packing: '5', comment: 'Текущий состав' };
const rows = () => [makePoint([photo(1), photo(2), photo(3)]), makePoint([photo(4)]),
  { ...makePoint([photo(5)]), removed: true }];

test('export plan uses edited active membership, deterministic collision-safe paths and current metadata without URLs', () => {
  let current = rows(); const id = current[0].id;
  current = removeMember(current, id, '2');
  current = appendPhotos(current, [photo(6, { coordinates: null, coordinateQuality: 'missing', indexFromOcr: null })]);
  current = moveMember(current, id, '3', current[1].id);
  current = restoreLastMember(current, id);
  const plan = localSessionPlan(current, metadata);
  assert.equal(plan.sessionName, 'Север___2');
  assert.deepEqual(plan.points.map((point) => point.directory), ['6950', '6950-2', 'point-6']);
  assert.deepEqual(plan.points[0].photos.map((photo) => photo.filename), ['6950-01.jpg', '6950-02.jpg']);
  assert.deepEqual(plan.points[1].photos.map(({ member }) => member.id), ['3', '4']);
  for (const point of plan.points) {
    assert.ok(point.text.includes(`Фото: ${point.photos.length}`));
    for (const field of ['Сессия: Север / 2', 'Цвет: Синий', 'Фасовка: 5', 'Комментарий: Текущий состав']) assert.ok(point.text.includes(field));
    assert.doesNotMatch(point.text, /https?:\/\//);
    for (const { filename } of point.photos) assert.ok(point.text.includes(filename));
  }
  assert.match(plan.points[2].text, /Требует проверки/);
  assert.equal(safeDirectory('../bad\\name:*?'), 'bad_name');
  assert.equal(safeDirectory('...'), 'session');
});

test('export cleans sequential copies, preserves originals, completes exact set, aborts on cleaning/staging/commit failure', async () => {
  for (const fail of ['', 'clean', 'stage', 'commit']) {
    const staged = [], original = new File(['original'], 'original.jpg', { type: 'image/jpeg' });
    let commits = 0, aborts = 0, cleans = 0;
    const destination = {
      begin: async ({ expectedFiles }) => { assert.equal(expectedFiles, 6); return { token: 'job' }; },
      stage: async (entry) => { if (fail === 'stage') throw new Error('disk full'); staged.push(entry); },
      commit: async () => { commits++; if (fail === 'commit') throw new Error('write verification'); return { directory: 'Север___2', files: 6 }; },
      abort: async () => { aborts++; },
    };
    const options = { destination, fileAt: async () => original, encode: async (blob) => Buffer.from(await blob.arrayBuffer()).toString('base64'),
      clean: async (source, { preferredFilename }) => {
        assert.equal(source, original); cleans++;
        if (fail === 'clean' && cleans === 2) return { ok: false, error: 'unsafe metadata' };
        return { ok: true, file: new File(['clean'], preferredFilename, { type: 'image/jpeg' }) };
      } };
    if (fail) {
      await assert.rejects(exportLocalSession(rows(), metadata, options));
      assert.equal(aborts, 1);
      assert.equal(commits, fail === 'commit' ? 1 : 0);
    } else {
      assert.equal((await exportLocalSession(rows(), metadata, options)).files, 6);
      assert.equal(staged.length, 6);
      assert.equal(cleans, 4);
      assert.equal(aborts, 0);
      assert.ok(staged.filter((file) => file.mime === 'image/jpeg').every((file) => Buffer.from(file.data, 'base64').toString() === 'clean'));
    }
    assert.equal(await original.text(), 'original');
  }
});
