import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { deriveMobileProcessingProgress } from '../src/features/ui/mobileProcessingProgress.js';

const entries = Array.from({ length: 10 }, (_, index) => ({
  id: String(index + 1),
  number: index + 1,
  status: index < 2 ? 'distance_ready' : index === 2 ? 'reading_gps' : 'buffered',
  statusText: index === 2 ? 'Распознавание координат, 60%' : '',
  gpsStatus: index < 2 ? 'done' : index === 2 ? 'processing' : 'idle',
  cleanupStatus: 'idle',
  uploadStatus: 'idle',
}));

const gpsProgress = deriveMobileProcessingProgress(entries, 10);
assert.equal(gpsProgress.photoNumber, 3);
assert.equal(gpsProgress.stage, 'gps');
assert.equal(gpsProgress.stageLabel, 'OCR');
assert.equal(gpsProgress.percentRounded, 26);

const cleanupEntries = entries.map((entry, index) => ({
  ...entry,
  status: index < 4 ? 'cleaned' : index === 4 ? 'cleaning' : 'distance_ready',
  gpsStatus: 'done',
  cleanupStatus: index < 4 ? 'done' : index === 4 ? 'processing' : 'idle',
  statusText: index === 4 ? 'Очистка metadata' : '',
}));
const cleanupProgress = deriveMobileProcessingProgress(cleanupEntries, 10);
assert.equal(cleanupProgress.photoNumber, 5);
assert.equal(cleanupProgress.stage, 'cleanup');
assert.equal(cleanupProgress.percentRounded, 44);

const uploadEntries = cleanupEntries.map((entry, index) => ({
  ...entry,
  status: index < 3 ? 'uploaded' : 'uploading',
  cleanupStatus: 'done',
  uploadStatus: index < 3 ? 'done' : 'processing',
  statusText: index < 3 ? 'Загружено' : 'Загрузка фотографий',
}));
const uploadProgress = deriveMobileProcessingProgress(uploadEntries, 10);
assert.equal(uploadProgress.photoNumber, 4);
assert.equal(uploadProgress.stage, 'upload');
assert.equal(uploadProgress.percentRounded, 34);

assert.equal(deriveMobileProcessingProgress(entries.map((entry) => ({
  ...entry,
  status: 'distance_ready',
  gpsStatus: 'done',
})), 10), null);

const [viewerSource, viewerCss, photoCardSource, resultsSummarySource, topBarSource] = await Promise.all([
  readFile(new URL('../src/components/PhotoViewerModal.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/PhotoViewerModal.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/PhotoCard.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/ResultsSummary.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/TopBar.jsx', import.meta.url), 'utf8'),
]);

assert.match(viewerSource, /setPointerCapture/);
assert.match(viewerSource, /type: 'pinch'/);
assert.match(viewerSource, /translate3d/);
assert.match(viewerCss, /touch-action:\s*none/);
assert.match(photoCardSource, /PhotoViewerModal/);
assert.match(photoCardSource, /data-photo-progress="true"/);
assert.match(photoCardSource, /Поделиться точкой/);
assert.match(photoCardSource, /shareCoordinateExport/);
assert.match(resultsSummarySource, /Поделиться сессией/);
assert.match(resultsSummarySource, /downloadCoordinateFile\('geojson'\)/);
assert.match(topBarSource, /role="progressbar"/);
assert.match(topBarSource, /MutationObserver/);

console.log('Mobile photo viewer, coordinate sharing, and sticky progress tests passed.');
