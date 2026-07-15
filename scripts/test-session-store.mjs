import assert from 'node:assert/strict';
import {
  LAST_SESSION_KEY,
  loadLastSession,
  restoreSessionPhotos,
  saveLastSession,
} from '../src/features/session/sessionStore.js';

const values = new Map();
const storage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key),
};
const heavyFile = new File(['source'], 'source.jpg', { type: 'image/jpeg' });
const snapshot = saveLastSession({
  sessionId: 'session-1',
  createdAt: '2026-07-04T10:00:00.000Z',
  thresholdMeters: 25,
  providerSettings: { freeimage: true, ninjabox: true, includeX0: false, fallbackX0: true },
  photos: [{
    id: 'photo-1',
    number: 1,
    fileName: 'source.jpg',
    safeName: 'source.jpg',
    size: heavyFile.size,
    coordinates: { latitude: 62.1, longitude: 34.1 },
    gpsSource: 'exif',
    gpsStatus: 'done',
    gpsConfidence: 0.88,
    ocrStatus: 'uncertain',
    manualCoordinates: true,
    coordinateQuality: 'manual',
    status: 'uploaded',
    distanceStatus: 'ok',
    distanceConflicts: [],
    cleanupStatus: 'done',
    uploadStatus: 'done',
    statusText: 'Загружено: 2 ссылок',
    userError: '',
    userWarnings: ['review coordinates'],
    uploadResult: {
      freeimageUrl: 'https://free.test/1',
      ninjaboxUrl: 'https://ninja.test/1',
      fallbackUrl: '',
      ninjaboxGalleryUrl: 'https://ninja.test/gallery',
      requestedProviders: ['freeimage', 'ninjabox'],
      links: [
        { provider: 'freeimage', url: 'https://free.test/1' },
        { provider: 'ninjabox', url: 'https://ninja.test/1' },
      ],
      complete: true,
    },
    thumbnailDataUrl: 'data:image/jpeg;base64,dGVzdA==',
    sourceBuffer: await heavyFile.arrayBuffer(),
    stableBlob: heavyFile,
    stableFile: heavyFile,
    cleanedBlob: heavyFile,
    previewObjectUrl: 'blob:secret',
    debug: { raw: 'must not persist' },
  }, {
    id: 'photo-low',
    number: 2,
    fileName: 'low.jpg',
    safeName: 'low.jpg',
    size: heavyFile.size,
    coordinates: { latitude: 64.60272, longitude: 30.62 },
    gpsSource: 'ocr',
    gpsStatus: 'low_precision',
    gpsConfidence: 0.62,
    ocrStatus: 'low_precision',
    manualCoordinates: false,
    coordinateQuality: 'low_precision',
    coordinatePrecision: { latitude: 5, longitude: 2 },
    coordinateText: { latitude: '64.60272', longitude: '30.62' },
    gpsWarnings: ['low_precision_coordinate'],
    status: 'distance_ready',
    distanceStatus: 'low_precision',
    distanceConflicts: ['low_precision_coordinate'],
    cleanupStatus: 'done',
    uploadStatus: 'idle',
    statusText: 'Координаты найдены, но точность низкая — проверь вручную',
    userError: '',
    userWarnings: [],
    uploadResult: null,
    thumbnailDataUrl: 'data:image/jpeg;base64,bG93',
    stableFile: heavyFile,
    debug: { raw: 'must not persist' },
  }],
}, storage);

const storedText = values.get(LAST_SESSION_KEY);
for (const forbidden of ['sourceBuffer', 'stableBlob', 'stableFile', 'cleanedBlob', 'previewObjectUrl', 'debug']) {
  assert.equal(storedText.includes(forbidden), false);
}
assert.equal(snapshot.photos[0].freeimageUrl, 'https://free.test/1');
const loaded = loadLastSession(storage);
assert.equal(loaded.sessionId, 'session-1');
assert.equal(loaded.version, 1);
const restored = restoreSessionPhotos(loaded);
assert.equal(restored[0].stableFile, null);
assert.equal(restored[0].id, 'photo-1');
assert.equal(restored[0].uploadResult.links.length, 2);
assert.equal(restored[0].uploadResult.ninjaboxGalleryUrl, 'https://ninja.test/gallery');
assert.equal(restored[0].status, 'uploaded');
assert.equal(restored[0].thumbnailDataUrl, 'data:image/jpeg;base64,dGVzdA==');
assert.equal(restored[0].gpsConfidence, 0.88);
assert.equal(restored[0].ocrStatus, 'uncertain');
assert.equal(restored[0].manualCoordinates, true);
assert.equal(restored[0].coordinateQuality, 'manual');
assert.deepEqual(restored[0].userWarnings, ['review coordinates']);
assert.equal(restored[0].canResumeUpload, false);
assert.equal(restored[1].gpsStatus, 'low_precision');
assert.equal(restored[1].ocrStatus, 'low_precision');
assert.equal(restored[1].coordinateQuality, 'low_precision');
assert.deepEqual(restored[1].coordinates, { latitude: 64.60272, longitude: 30.62 });
assert.deepEqual(restored[1].coordinatePrecision, { latitude: 5, longitude: 2 });
assert.deepEqual(restored[1].coordinateText, { latitude: '64.60272', longitude: '30.62' });
assert.deepEqual(restored[1].gpsWarnings, ['low_precision_coordinate']);
assert.equal(restored[1].distanceStatus, 'low_precision');
assert.equal(restored[1].statusText, 'Координаты найдены, но точность низкая — проверь вручную');

console.log('Session store tests passed');
