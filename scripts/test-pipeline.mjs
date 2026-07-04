import assert from 'node:assert/strict';
import { replacePhotoBatch } from '../src/app/appState.js';
import { runPhotoPipeline } from '../src/app/pipeline.js';
import { readGpsPipeline } from '../src/features/gps/readGpsPipeline.js';

const ocrWithOrientation = await readGpsPipeline(new File(['gps'], 'ocr.jpg', { type: 'image/jpeg' }), {
  dependencies: {
    readOcr: async () => ({ ok: true, latitude: 62.223456, longitude: 34.223456 }),
    readExif: async () => ({ orientation: 6, coordinates: null, exifError: null }),
  },
});
assert.equal(ocrWithOrientation.found, true);
assert.deepEqual(ocrWithOrientation.coordinates, { latitude: 62.223456, longitude: 34.223456 });
assert.equal(ocrWithOrientation.orientation, 6);

const makePhoto = async (id, number) => {
  const stableFile = new File([`source-${id}`], `${id}.jpg`, { type: 'image/jpeg' });
  return {
    id,
    number,
    fileName: `${id}.jpg`,
    safeName: `${id}.jpg`,
    type: 'image/jpeg',
    size: stableFile.size,
    status: 'buffered',
    statusText: 'Готово к проверке',
    gpsStatus: 'idle',
    cleanupStatus: 'idle',
    uploadStatus: 'idle',
    coordinates: null,
    latitude: null,
    longitude: null,
    gpsSource: null,
    orientation: 1,
    distanceStatus: 'pending',
    distanceConflicts: [],
    uploadResult: null,
    userError: '',
    stableFile,
    stableBlob: stableFile,
    sourceBuffer: await stableFile.arrayBuffer(),
    cleanedBlob: null,
    previewObjectUrl: null,
    thumbnailDataUrl: `data:image/jpeg;base64,${id}`,
    debug: {},
  };
};

const cleanSuccess = async (file) => ({
  ok: true,
  file: new File([`clean-${file.name}`], `clean-${file.name}`, { type: 'image/jpeg' }),
  method: 'test',
  verification: { checked: true, hasGps: false, hasExif: false },
  debug: { selectedCleanupPath: 'test' },
});

const uploadSuccess = async (entries) => new Map(entries.map((entry) => [entry.photoId, {
  freeimageUrl: `https://free.test/${entry.photoId}`,
  ninjaboxUrl: `https://ninja.test/${entry.photoId}`,
  ninjaboxGalleryUrl: 'https://ninja.test/gallery',
  fallbackUrl: '',
  x0Url: '',
  uploadWarnings: [],
  links: [
    { provider: 'freeimage', url: `https://free.test/${entry.photoId}` },
    { provider: 'ninjabox', url: `https://ninja.test/${entry.photoId}` },
  ],
  requestedProviders: ['freeimage', 'ninjabox'],
  providerResults: {},
  complete: true,
  partial: false,
}]));

// Missing GPS and OCR errors are non-blocking.
const missingPhotos = [await makePhoto('missing', 1), await makePhoto('found', 2)];
const cleanedIds = [];
let uploadedEntries = [];
const missingResult = await runPhotoPipeline({
  photos: missingPhotos,
  dependencies: {
    readGps: async (file) => file.name === 'missing.jpg'
      ? Promise.reject(new Error('OCR failed'))
      : { found: true, coordinates: { latitude: 62.1, longitude: 34.1 }, source: 'ocr', orientation: 1, debug: {} },
    clean: async (file) => { cleanedIds.push(file.name); return cleanSuccess(file); },
    upload: async (entries) => { uploadedEntries = entries; return uploadSuccess(entries); },
  },
});
assert.deepEqual(cleanedIds, ['missing.jpg', 'found.jpg']);
assert.equal(missingResult.photos[0].gpsStatus, 'missing');
assert.equal(missingResult.photos[0].uploadStatus, 'done');
assert.equal(missingResult.photos[0].distanceStatus, 'missing_coordinates');
assert.equal(uploadedEntries.length, 2);
assert.ok(uploadedEntries.every((entry, index) => entry.cleaned && entry.file !== missingPhotos[index].stableFile));
assert.ok(missingResult.photos.every((photo) => photo.stableFile === null && photo.thumbnailDataUrl));

// A distance conflict is informational and does not block cleanup/upload.
const closePhotos = [await makePhoto('close-a', 1), await makePhoto('close-b', 2)];
let closeCleanCount = 0;
let closeUploadCount = 0;
const closeResult = await runPhotoPipeline({
  photos: closePhotos,
  dependencies: {
    readGps: async (file) => ({
      found: true,
      coordinates: file.name === 'close-a.jpg'
        ? { latitude: 62.1, longitude: 34.1 }
        : { latitude: 62.10001, longitude: 34.10001 },
      source: 'ocr', orientation: 1, debug: {},
    }),
    clean: async (file) => { closeCleanCount += 1; return cleanSuccess(file); },
    upload: async (entries) => { closeUploadCount = entries.length; return uploadSuccess(entries); },
  },
});
assert.equal(closeResult.distanceResult.violations.length, 1);
assert.equal(closeCleanCount, 2);
assert.equal(closeUploadCount, 2);
assert.ok(closeResult.photos.every((photo) => photo.uploadStatus === 'done'));

// Cleanup failure skips only failed photos; the rest still upload.
const mixedPhotos = [await makePhoto('broken', 1), await makePhoto('ok-a', 2), await makePhoto('ok-b', 3)];
let isolatedEntries = [];
const mixedResult = await runPhotoPipeline({
  photos: mixedPhotos,
  dependencies: {
    readGps: async () => ({ found: false, coordinates: null, orientation: 1, debug: {} }),
    clean: async (file) => file.name === 'broken.jpg'
      ? { ok: false, file: null, error: 'broken jpeg', debug: { selectedCleanupPath: 'canvas-fallback' } }
      : cleanSuccess(file),
    upload: async (entries) => { isolatedEntries = entries; return uploadSuccess(entries); },
  },
});
assert.deepEqual(isolatedEntries.map((entry) => entry.photoId), ['ok-a', 'ok-b']);
assert.equal(mixedResult.photos[0].cleanupStatus, 'failed');
assert.equal(mixedResult.photos[0].uploadStatus, 'skipped');
assert.equal(mixedResult.photos[0].userError, 'Не удалось очистить metadata. Фото не загружено.');
assert.equal(mixedResult.photos[1].uploadStatus, 'done');
assert.equal(mixedResult.photos[2].uploadStatus, 'done');

// A new batch after partial cleanup failure starts with fresh state and buffers.
const firstBatch = await Promise.all(Array.from({ length: 10 }, (_, index) => makePhoto(`batch1-${index + 1}`, index + 1)));
const firstRun = await runPhotoPipeline({
  photos: firstBatch,
  dependencies: {
    readGps: async () => ({ found: false, coordinates: null, orientation: 1, debug: {} }),
    clean: async (file) => /batch1-(9|10)\.jpg/.test(file.name)
      ? { ok: false, file: null, error: 'simulated cleanup failure', debug: {} }
      : cleanSuccess(file),
    upload: uploadSuccess,
  },
});
assert.equal(firstRun.uploadedCount, 8);
assert.equal(firstRun.failedCount, 2);

const freshBuffered = await Promise.all(Array.from({ length: 3 }, async (_, index) => {
  const photo = await makePhoto(`batch2-${index + 1}`, index + 1);
  return {
    originalName: photo.fileName,
    safeName: photo.safeName,
    type: photo.type,
    size: photo.size,
    sourceBuffer: photo.sourceBuffer,
    stableBlob: photo.stableBlob,
    stableFile: photo.stableFile,
    previewObjectUrl: null,
    thumbnailDataUrl: photo.thumbnailDataUrl,
  };
}));
const replacement = replacePhotoBatch(firstRun.photos, freshBuffered);
assert.ok(replacement.releasedPrevious.every((photo) => photo.stableFile === null && photo.cleanedBlob === null));
assert.ok(replacement.photos.every((photo) => (
  photo.status === 'buffered'
  && photo.userError === ''
  && photo.uploadResult === null
  && photo.cleanupStatus === 'idle'
  && photo.uploadStatus === 'idle'
)));

const secondRun = await runPhotoPipeline({
  photos: replacement.photos,
  dependencies: {
    readGps: async () => ({ found: false, coordinates: null, orientation: 1, debug: {} }),
    clean: cleanSuccess,
    upload: uploadSuccess,
  },
});
assert.equal(secondRun.uploadedCount, 3);
assert.equal(secondRun.failedCount, 0);
assert.ok(secondRun.photos.every((photo) => photo.userError === '' && photo.uploadStatus === 'done'));

const noLinksResult = await runPhotoPipeline({
  photos: [await makePhoto('no-links', 1)],
  dependencies: {
    readGps: async () => ({ found: false, coordinates: null, orientation: 1, debug: {} }),
    clean: cleanSuccess,
    upload: async () => new Map(),
  },
});
assert.equal(noLinksResult.photos[0].uploadStatus, 'failed');
assert.equal(noLinksResult.photos[0].userError, 'Не удалось загрузить фото. Повторите попытку.');

console.log('Pipeline tests passed');
