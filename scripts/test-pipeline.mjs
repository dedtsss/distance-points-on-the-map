import assert from 'node:assert/strict';
import {
  applyManualCoordinateCorrection,
  applyManualIndexCorrection,
  getProgressSummary,
  replacePhotoBatch,
} from '../src/app/appState.js';
import { runPhotoPipeline } from '../src/app/pipeline.js';
import { calculateDistances } from '../src/features/distance/distanceService.js';
import { readGpsPipeline } from '../src/features/gps/readGpsPipeline.js';
import { validateCoordinateBatch } from '../src/features/gps/coordinateSanity.js';

const ocrWithOrientation = await readGpsPipeline(new File(['gps'], 'ocr.jpg', { type: 'image/jpeg' }), {
  dependencies: {
    readOcr: async () => ({ ok: true, latitude: 62.223456, longitude: 34.223456 }),
    readExif: async () => ({ orientation: 6, coordinates: null, exifError: null }),
  },
});
assert.equal(ocrWithOrientation.found, true);
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
    gpsConfidence: 0,
    ocrStatus: 'idle',
    indexFromOcr: null,
    indexStatus: 'missing',
    manualCoordinates: false,
    coordinateQuality: 'missing',
    coordinatePrecision: null,
    coordinateText: null,
    gpsWarnings: [],
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

const cleanSuccess = async (file, options = {}) => ({
  ok: true,
  file: new File([`clean-${file.name}`], options.preferredFilename || `clean-${file.name}`, { type: 'image/jpeg' }),
  method: 'test',
  verification: { checked: true, hasGps: false, hasExif: false },
  debug: { selectedCleanupPath: 'test' },
});

const uploadResultFor = (entry, provider = 'ninjabox') => ({
  freeimageUrl: provider === 'freeimage' ? `https://free.test/${entry.photoId}` : '',
  ninjaboxUrl: provider === 'ninjabox' ? `https://ninja.test/${entry.photoId}` : '',
  fallbackUrl: provider === 'ninjabox' ? '' : `https://${provider}.test/${entry.photoId}`,
  x0Url: provider === 'x0' ? `https://x0.test/${entry.photoId}` : '',
  uploadWarnings: [],
  links: [{ provider, url: `https://${provider}.test/${entry.photoId}` }],
  attempts: [{ provider, ok: true, url: `https://${provider}.test/${entry.photoId}` }],
  providerOrder: ['ninjabox', 'freeimage', 'x0'],
  selectedProvider: provider,
  providerResults: { [provider]: { ok: true } },
  complete: true,
  partial: false,
});

const uploadSuccess = async (entries, options = {}) => {
  const results = new Map();
  let completed = 0;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    options.onProgress?.({ type: 'started', photoId: entry.photoId, index, photoNumber: index + 1, total: entries.length, completed });
    const result = uploadResultFor(entry);
    results.set(entry.photoId, result);
    completed += 1;
    options.onProgress?.({ type: 'completed', photoId: entry.photoId, index, photoNumber: index + 1, total: entries.length, completed, result });
  }
  return results;
};

// Missing GPS remains non-blocking, and upload progress advances one photo at a time.
const photos = [await makePhoto('missing', 1), await makePhoto('found', 2)];
const statusEvents = [];
const result = await runPhotoPipeline({
  photos,
  dependencies: {
    readGps: async (file) => file.name === 'missing.jpg'
      ? Promise.reject(new Error('OCR failed'))
      : {
        found: true,
        coordinates: { latitude: 64.607016, longitude: 30.62284 },
        source: 'ocr',
        confidence: 0.9,
        ocrStatus: 'confident',
        indexFromOcr: '6369',
        indexStatus: 'found',
        orientation: 1,
        debug: {},
      },
    clean: cleanSuccess,
    upload: uploadSuccess,
  },
  onPhotoUpdate: (photoId, patch) => {
    if (patch.uploadStatus) statusEvents.push(`${photoId}:${patch.uploadStatus}`);
  },
});
assert.equal(result.photos[0].gpsStatus, 'missing');
assert.equal(result.photos[0].distanceStatus, 'missing_coordinates');
assert.ok(result.photos.every((photo) => photo.uploadStatus === 'done'));
assert.deepEqual(statusEvents.filter((event) => /processing|done/.test(event)), [
  'missing:processing',
  'missing:done',
  'found:processing',
  'found:done',
]);
assert.ok(result.photos.every((photo) => photo.stableFile === null && photo.cleanedBlob === null));
assert.equal(result.photos[1].indexFromOcr, '6369');
assert.equal(result.photos[1].internalName, 'index-6369');

// Manual index remains authoritative during later OCR.
const manualIndexBase = applyManualIndexCorrection([await makePhoto('manual-index', 1)], 'manual-index', '0123');
const manualIndexResult = await runPhotoPipeline({
  photos: manualIndexBase,
  stages: { gps: true, cleanup: false, upload: false },
  dependencies: {
    readGps: async () => ({
      found: true,
      coordinates: { latitude: 64.6, longitude: 30.6 },
      source: 'ocr',
      confidence: 0.91,
      ocrStatus: 'confident',
      indexFromOcr: '9999',
      indexStatus: 'found',
      orientation: 1,
      debug: {},
    }),
  },
});
assert.equal(manualIndexResult.photos[0].indexFromOcr, '0123');
assert.equal(manualIndexResult.photos[0].indexStatus, 'manual');

// Low-precision coordinates survive for manual confirmation but do not become normal distance points.
const lowPrecisionPhotos = [await makePhoto('trusted', 1), await makePhoto('low', 2)];
const lowPrecisionResult = await runPhotoPipeline({
  photos: lowPrecisionPhotos,
  stages: { gps: true, cleanup: false, upload: false },
  dependencies: {
    readGps: async (file) => file.name === 'trusted.jpg'
      ? {
        found: true,
        coordinates: { latitude: 64.60271, longitude: 30.61999 },
        source: 'ocr',
        confidence: 0.88,
        ocrStatus: 'confident',
        coordinateQuality: 'confident',
        orientation: 1,
        debug: {},
      }
      : {
        found: true,
        coordinates: { latitude: 64.60272, longitude: 30.62 },
        source: 'ocr',
        confidence: 0.62,
        ocrStatus: 'low_precision',
        coordinateQuality: 'low_precision',
        coordinatePrecision: { latitude: 5, longitude: 2 },
        coordinateText: { latitude: '64.60272', longitude: '30.62' },
        gpsWarnings: ['low_precision_coordinate'],
        orientation: 1,
        debug: {},
      },
  },
});
const lowPhoto = lowPrecisionResult.photos.find((photo) => photo.id === 'low');
assert.equal(lowPhoto.coordinateQuality, 'low_precision');
assert.equal(lowPhoto.distanceStatus, 'low_precision');
assert.equal(getProgressSummary(lowPrecisionResult.photos).lowPrecision, 1);

const confirmed = applyManualCoordinateCorrection(
  lowPrecisionResult.photos,
  'low',
  { latitude: 64.60272, longitude: 30.62 },
  (items) => calculateDistances(items, 25),
);
assert.equal(confirmed.find((photo) => photo.id === 'low').coordinateQuality, 'manual');

// Suspicious outlier detection remains active.
const sanityPhotos = [
  { id: 'a', coordinates: { latitude: 64.6, longitude: 30.6 }, gpsConfidence: 0.9, ocrStatus: 'confident' },
  { id: 'b', coordinates: { latitude: 64.61, longitude: 30.61 }, gpsConfidence: 0.9, ocrStatus: 'confident' },
  { id: 'bad', coordinates: { latitude: 30.591181, longitude: 164.60467 }, gpsConfidence: 0.9, ocrStatus: 'confident' },
];
const sanity = validateCoordinateBatch(sanityPhotos);
assert.equal(sanity.byPhotoId.get('bad').coordinateQuality, 'suspicious');

// Cleanup failure isolates one photo; remaining photos still upload.
const mixedPhotos = [await makePhoto('broken', 1), await makePhoto('ok-a', 2), await makePhoto('ok-b', 3)];
const mixedResult = await runPhotoPipeline({
  photos: mixedPhotos,
  dependencies: {
    readGps: async () => ({ found: false, coordinates: null, orientation: 1, debug: {} }),
    clean: async (file, options) => file.name === 'broken.jpg'
      ? { ok: false, file: null, error: 'broken jpeg', debug: {} }
      : cleanSuccess(file, options),
    upload: uploadSuccess,
  },
});
assert.equal(mixedResult.photos[0].cleanupStatus, 'failed');
assert.equal(mixedResult.photos[0].uploadStatus, 'skipped');
assert.equal(mixedResult.photos[1].uploadStatus, 'done');
assert.equal(mixedResult.photos[2].uploadStatus, 'done');

// A provider failure on one photo does not stop the next photo.
const providerFailurePhotos = [await makePhoto('upload-broken', 1), await makePhoto('upload-ok', 2)];
const providerFailureResult = await runPhotoPipeline({
  photos: providerFailurePhotos,
  dependencies: {
    readGps: async () => ({ found: false, coordinates: null, orientation: 1, debug: {} }),
    clean: cleanSuccess,
    upload: async (entries, options = {}) => {
      const results = new Map();
      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        options.onProgress?.({ type: 'started', photoId: entry.photoId, index, photoNumber: index + 1, total: entries.length, completed: index });
        const value = entry.photoId === 'upload-broken'
          ? { links: [], attempts: [{ provider: 'ninjabox', ok: false, error: 'down' }], technicalError: 'all providers failed' }
          : uploadResultFor(entry, 'freeimage');
        results.set(entry.photoId, value);
        options.onProgress?.({ type: 'completed', photoId: entry.photoId, index, photoNumber: index + 1, total: entries.length, completed: index + 1, result: value });
      }
      return results;
    },
  },
});
assert.equal(providerFailureResult.photos[0].uploadStatus, 'failed');
assert.equal(providerFailureResult.photos[1].uploadStatus, 'done');
assert.match(providerFailureResult.photos[1].statusText, /Freeimage.*резерв/);

// Replacing a batch creates clean state and releases previous buffers.
const freshBuffered = await Promise.all(Array.from({ length: 2 }, async (_, index) => {
  const photo = await makePhoto(`fresh-${index + 1}`, index + 1);
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
const replacement = replacePhotoBatch(result.photos, freshBuffered);
assert.ok(replacement.releasedPrevious.every((photo) => photo.stableFile === null));
assert.ok(replacement.photos.every((photo) => photo.uploadStatus === 'idle' && photo.uploadResult === null));

console.log('Pipeline and per-photo upload progress tests passed');
