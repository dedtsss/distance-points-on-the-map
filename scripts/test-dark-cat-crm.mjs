import assert from 'node:assert/strict';
import {
  createPhotoTransferPlan,
  createSession,
  isActivePhoto,
  isReservePhoto,
  transitionSessionStage,
  withPhotoWorkStatus,
} from '../src/features/session/sessionDomain.js';
import {
  createStoredSession,
  deleteStoredSession,
  listStoredSessions,
  restoreStoredSession,
  saveSessionRecord,
} from '../src/features/session/sessionRepository.js';
import { recommendReserveForConflicts } from '../src/features/session/conflictResolver.js';
import { findDistanceViolations } from '../src/utils/geoDistance.js';
import { buildExportPackage } from '../src/features/export/exportPackage.js';
import { buildSessionTextExport, buildSessionTxtFileName } from '../src/features/export/sessionTextExport.js';
import { CRM_SETTINGS_KEY, loadCrmSettings, saveCrmSettings } from '../src/features/settings/settingsStore.js';

const values = new Map();
const storage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key),
};

const photo = (id, number, latitude, longitude) => ({
  id,
  number,
  fileName: `${id}.jpg`,
  coordinates: { latitude, longitude },
  latitude,
  longitude,
  gpsStatus: 'done',
  gpsSource: 'manual',
  coordinateQuality: 'manual',
  indexFromOcr: String(number + 100),
  uploadResult: { links: [{ provider: 'ninjabox', url: `https://example.test/${id}` }] },
});

// Immutable, sequential session numbers and persistent restoration.
const first = createStoredSession({ title: 'Первая', color: 'Красный' }, storage);
const second = createStoredSession({ title: 'Вторая', color: 'Синий' }, storage);
assert.equal(first.sessionNumber, 1);
assert.equal(second.sessionNumber, 2);
const persistedFirst = saveSessionRecord({ ...first, photos: [photo('a', 1, 64.1, 30.1)] }, storage);
assert.equal(persistedFirst.sessionNumber, 1);
assert.equal(listStoredSessions(storage).length, 2);
assert.equal(restoreStoredSession(persistedFirst).photos[0].stableFile, null);
assert.deepEqual(deleteStoredSession(second.sessionId, storage).map((session) => session.sessionNumber), [1]);

// The graph is a triangle plus a standalone point: exact minimum cover is 2.
const graphPhotos = [
  photo('a', 1, 64.100000, 30.100000),
  photo('b', 2, 64.100010, 30.100010),
  photo('c', 3, 64.100020, 30.100020),
  photo('d', 4, 64.105000, 30.105000),
];
const recommendation = recommendReserveForConflicts(graphPhotos, 25);
assert.equal(recommendation.strategy, 'exact-minimum');
assert.equal(recommendation.conflictCount, 3);
assert.equal(recommendation.reservePhotoIds.length, 2);
const resolved = graphPhotos.map((item) => recommendation.reservePhotoIds.includes(item.id)
  ? withPhotoWorkStatus(item, 'reserve', 'test')
  : item);
assert.equal(findDistanceViolations(resolved, { thresholdMeters: 25 }).length, 0);
assert.equal(resolved.filter(isReservePhoto).length, 2);
assert.equal(resolved.filter(isActivePhoto).length, 2);

// Stage changes are reversible and only recognised stages are accepted.
const draft = createSession({ sessionId: 'stage', sessionNumber: 42, stage: 'processing' });
assert.equal(transitionSessionStage(draft, 'map').stage, 'map');
assert.equal(transitionSessionStage(draft, 'not-a-stage').stage, 'processing');
assert.equal(createPhotoTransferPlan({ sourceSessionId: 'a', targetSessionId: 'b', photoId: 'p' }).valid, true);
assert.equal(createPhotoTransferPlan({ sourceSessionId: 'a', targetSessionId: 'a', photoId: 'p' }).valid, false);

// Result/TXT contract is ACTIVE-only and filename ordering is stable.
const exportSession = {
  sessionId: 'export',
  sessionNumber: 42,
  packing: '10 шт.',
  color: 'Красный',
  description: 'Общий комментарий',
  photos: [
    graphPhotos[0],
    withPhotoWorkStatus(graphPhotos[1], 'reserve', 'distance'),
  ],
};
const textExport = buildSessionTextExport(exportSession);
assert.equal(textExport.fileName, '0042_10шт_Красный_1.txt');
assert.equal(buildSessionTxtFileName({ sessionNumber: 7, packing: '', color: '' }, 0), '0007_без-фасовки_без-цвета_0.txt');
assert.match(textExport.content, /#101/);
assert.doesNotMatch(textExport.content, /#102/);
const exportPackage = buildExportPackage(exportSession);
assert.equal(exportPackage.schemaVersion, 1);
assert.equal(exportPackage.sessionNumber, 42);
assert.equal(exportPackage.activeCount, 1);
assert.equal(exportPackage.items.length, 1);
assert.equal(exportPackage.items[0].id, 'a');
assert.match(exportPackage.formattedText, /#101/);

// Working settings persistence with safe normalization.
assert.equal(loadCrmSettings(storage).distanceThresholdMeters, 25);
const settings = saveCrmSettings({ metadataCleanup: false, renameFiles: false, metadataFirst: true, mapLayerId: 'osm', distanceThresholdMeters: 29 }, storage);
assert.equal(settings.metadataCleanup, false);
assert.equal(loadCrmSettings(storage).mapLayerId, 'osm');
assert.equal(loadCrmSettings(storage).distanceThresholdMeters, 29);
assert.ok(values.get(CRM_SETTINGS_KEY));

console.log('Dark Cat CRM domain, storage, conflicts, export and settings tests passed');
