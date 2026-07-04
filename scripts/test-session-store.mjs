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
    number: 1,
    fileName: 'source.jpg',
    safeName: 'source.jpg',
    size: heavyFile.size,
    coordinates: { latitude: 62.1, longitude: 34.1 },
    gpsSource: 'exif',
    distanceStatus: 'ok',
    distanceConflicts: [],
    cleanupStatus: 'done',
    uploadStatus: 'done',
    statusText: 'Загружено: 2 ссылок',
    userError: '',
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
  }],
}, storage);

const storedText = values.get(LAST_SESSION_KEY);
for (const forbidden of ['sourceBuffer', 'stableBlob', 'stableFile', 'cleanedBlob', 'previewObjectUrl', 'debug']) {
  assert.equal(storedText.includes(forbidden), false);
}
assert.equal(snapshot.photos[0].freeimageUrl, 'https://free.test/1');
const loaded = loadLastSession(storage);
assert.equal(loaded.sessionId, 'session-1');
const restored = restoreSessionPhotos(loaded);
assert.equal(restored[0].stableFile, null);
assert.equal(restored[0].uploadResult.links.length, 2);
assert.equal(restored[0].uploadResult.ninjaboxGalleryUrl, 'https://ninja.test/gallery');
assert.equal(restored[0].status, 'uploaded');
assert.equal(restored[0].thumbnailDataUrl, 'data:image/jpeg;base64,dGVzdA==');

console.log('Session store tests passed');
