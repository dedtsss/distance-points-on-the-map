import assert from 'node:assert/strict';
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
    status: 'buffered',
    gpsStatus: 'idle',
    cleanupStatus: 'idle',
    uploadStatus: 'idle',
    coordinates: null,
    latitude: null,
    longitude: null,
    gpsSource: null,
    distanceConflicts: [],
    stableFile,
    stableBlob: stableFile,
    sourceBuffer: await stableFile.arrayBuffer(),
    cleanedBlob: null,
    previewObjectUrl: null,
    debug: {},
  };
};

const photos = [await makePhoto('missing', 1), await makePhoto('found', 2)];
const cleanedIds = [];
let uploadedEntries = [];
const result = await runPhotoPipeline({
  photos,
  dependencies: {
    readGps: async (file) => {
      if (file.name === 'missing.jpg') throw new Error('OCR failed');
      return {
        found: true,
        coordinates: { latitude: 62.1, longitude: 34.1 },
        source: 'ocr',
        orientation: 1,
        debug: {},
      };
    },
    clean: async (file) => {
      cleanedIds.push(file.name);
      const cleaned = new File([`clean-${file.name}`], `clean-${file.name}`, { type: 'image/jpeg' });
      return { ok: true, file: cleaned, method: 'test', verification: { checked: true, hasGps: false, hasExif: false } };
    },
    upload: async (entries) => {
      uploadedEntries = entries;
      return new Map(entries.map((entry) => [entry.photoId, {
        freeimageUrl: `https://free.test/${entry.photoId}`,
        ninjaboxUrl: `https://ninja.test/${entry.photoId}`,
        ninjaboxGalleryUrl: 'https://ninja.test/gallery',
        fallbackUrl: '',
        uploadWarnings: [],
        links: [
          { provider: 'freeimage', url: `https://free.test/${entry.photoId}` },
          { provider: 'ninjabox', url: `https://ninja.test/${entry.photoId}` },
        ],
        providerResults: {},
        complete: true,
        partial: false,
      }]));
    },
  },
});

assert.deepEqual(cleanedIds, ['missing.jpg', 'found.jpg']);
assert.equal(result.photos[0].gpsStatus, 'missing');
assert.equal(result.photos[0].uploadStatus, 'done');
assert.equal(result.photos[0].distanceStatus, 'missing_coordinates');
assert.equal(result.photos[1].uploadStatus, 'done');
assert.equal(uploadedEntries.length, 2);
assert.ok(uploadedEntries.every((entry, index) => entry.cleaned && entry.file !== photos[index].stableFile));
assert.ok(result.photos.every((photo) => photo.stableFile === null && photo.cleanedBlob === null));

let uploadCalled = false;
const cleanupFailure = await runPhotoPipeline({
  photos: [await makePhoto('broken', 1)],
  dependencies: {
    readGps: async () => ({ found: false, coordinates: null, orientation: 1, debug: {} }),
    clean: async () => ({ ok: false, file: null, error: 'broken jpeg' }),
    upload: async () => { uploadCalled = true; return new Map(); },
  },
});
assert.equal(uploadCalled, false);
assert.equal(cleanupFailure.photos[0].cleanupStatus, 'failed');
assert.equal(cleanupFailure.photos[0].uploadStatus, 'skipped');
assert.match(cleanupFailure.photos[0].userError, /Фото не загружено/);

console.log('Pipeline tests passed');
