import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createD1SessionAdapter } from '../src/features/session/d1SessionAdapter.js';
import { findLocalSessionsForD1Import, importLocalSessionsToD1, isD1MigrationComplete } from '../src/features/session/sessionMigration.js';
import { saveSessionRecord } from '../src/features/session/sessionRepository.js';
import {
  getD1Dashboard,
  getD1Session,
  listD1Sessions,
  upsertD1Session,
} from '../workers/host-proxy/d1SessionRepository.js';
import { saveLastSession } from '../src/features/session/sessionStore.js';
import { handleWorkerRequest } from '../workers/host-proxy/worker.js';

class MockD1Statement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.args = [];
  }

  bind(...args) {
    this.args = args;
    return this;
  }

  all() {
    return { results: this.db.prepare(this.sql).all(...this.args) };
  }

  first() {
    return this.db.prepare(this.sql).get(...this.args) ?? null;
  }

  run() {
    const result = this.db.prepare(this.sql).run(...this.args);
    return { success: true, meta: { changes: Number(result.changes || 0), last_row_id: Number(result.lastInsertRowid || 0) } };
  }
}

class MockD1 {
  constructor(schema) {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec(schema);
  }

  prepare(sql) {
    return new MockD1Statement(this.sqlite, sql);
  }

  async batch(statements) {
    this.sqlite.exec('BEGIN');
    try {
      const results = statements.map((statement) => statement.run());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
}

const schema = fs.readFileSync(new URL('../migrations/0001_dark_cat_crm_sessions.sql', import.meta.url), 'utf8');
const db = new MockD1(schema);
// Applying the migration twice is a required safe operation.
db.sqlite.exec(schema);

const photo = (photoId, workStatus = 'active') => ({
  photoId,
  number: Number(photoId.replace(/\D/g, '')) || 1,
  fileName: `${photoId}.jpg`,
  processedFileName: `gps-${photoId}.jpg`,
  indexFromOcr: 'A-01',
  coordinates: { latitude: 61.7, longitude: 34.3 },
  gpsSource: 'exif',
  coordinateQuality: 'confident',
  workStatus,
  reserveReason: workStatus === 'reserve' ? 'test reserve' : '',
  thumbnailDataUrl: 'data:image/jpeg;base64,not-stored',
  sourceBuffer: { secret: 'not-stored' },
  thumbnailReference: 'https://images.example.test/thumb.jpg',
  uploadResult: { links: [{ provider: 'test', url: 'https://images.example.test/photo.jpg' }] },
});

const first = await upsertD1Session(db, {
  sessionId: 'session-one',
  sessionNumber: 999,
  title: 'One',
  status: 'in_progress',
  stage: 'result',
  thresholdMeters: 25,
  processingSettings: { metadataCleanup: false, renameFiles: true, metadataFirst: false },
  processingWorkflow: { current: 'result', completed: ['photos', 'recognition', 'map', 'upload', 'result'], stale: ['result'] },
  photos: [photo('photo-1'), photo('photo-2', 'reserve')],
});
assert.equal(first.sessionNumber, 1, 'the server allocates the first number');
assert.deepEqual(first.processingSettings, { metadataCleanup: false, renameFiles: true, metadataFirst: false });
assert.deepEqual(first.processingWorkflow, { current: 'result', completed: ['photos', 'recognition', 'map', 'upload', 'result'], stale: ['result'] }, 'D1 save/load round-trip preserves workflow current/completed/stale');
assert.equal(first.photos.length, 2);
assert.equal(first.photos[1].workStatus, 'reserve');
assert.equal(first.photos[0].thumbnailDataUrl, null, 'D1 does not return image data URLs');
assert.equal('sourceBuffer' in first.photos[0], false, 'D1 does not return source buffers');
assert.equal(first.photos[0].uploadResult.links[0].url, 'https://images.example.test/photo.jpg');

const update = await upsertD1Session(db, { ...first, title: 'Updated', sessionNumber: 2, photos: [photo('photo-1', 'reserve')] });
assert.equal(update.sessionNumber, 1, 'session number is immutable on update');
assert.equal(update.title, 'Updated');
assert.deepEqual(update.processingSettings, { metadataCleanup: false, renameFiles: true, metadataFirst: false });
assert.deepEqual(update.processingWorkflow, first.processingWorkflow, 'D1 update round-trip preserves workflow state');
assert.deepEqual((await getD1Session(db, 'session-one')).processingWorkflow, first.processingWorkflow, 'D1 get preserves workflow state');
assert.equal((await getD1Session(db, 'session-one')).photos[0].workStatus, 'reserve');

const concurrent = await Promise.all(Array.from({ length: 12 }, (_, index) => upsertD1Session(db, {
  sessionId: `parallel-${index}`,
  sessionNumber: 1,
  title: `Parallel ${index}`,
  photos: [],
})));
const numbers = [first, ...concurrent].map((session) => session.sessionNumber);
assert.equal(new Set(numbers).size, numbers.length, 'concurrent allocation is unique');
assert.deepEqual([...numbers].sort((a, b) => a - b), Array.from({ length: numbers.length }, (_, index) => index + 1));

const listed = await listD1Sessions(db);
assert.equal(listed.length, 13);
assert.deepEqual(getD1Dashboard(listed), {
  sessionCount: 13,
  photoCount: 1,
  activeCount: 0,
  reserveCount: 1,
  uploadedCount: 1,
  attentionCount: 0,
});

const workerEnv = { DB: db };
await assert.rejects(
  () => upsertD1Session(db, { sessionId: 'duplicate-photo-session', photos: [photo('photo-duplicate'), photo('photo-duplicate')] }),
  /Duplicate photo id/,
);
const unauthorizedSession = await handleWorkerRequest(new Request('https://gps-guest.bruce-group.net/api/sessions'), {
  BASIC_AUTH_REQUIRED: 'true', BASIC_AUTH_USERNAME: 'GPS', BASIC_AUTH_PASSWORD: 'secret-for-test-only',
});
assert.equal(unauthorizedSession.status, 401);
const getResponse = await handleWorkerRequest(new Request('https://gps.bruce-group.net/api/sessions'), workerEnv);
assert.equal(getResponse.status, 200);
assert.equal((await getResponse.json()).sessions.length, 13);
const malformed = await handleWorkerRequest(new Request('https://gps.bruce-group.net/api/sessions/session-api', {
  method: 'PUT', body: '{bad', headers: { 'Content-Type': 'application/json' },
}), workerEnv);
assert.equal(malformed.status, 400);
const notFound = await handleWorkerRequest(new Request('https://gps.bruce-group.net/api/sessions/no-such'), workerEnv);
assert.equal(notFound.status, 404);

const failedAdapter = createD1SessionAdapter(async () => new Response(JSON.stringify({ ok: false, error: 'unavailable' }), { status: 503 }));
await assert.rejects(() => failedAdapter.saveSession({ sessionId: 'session-one', photos: [] }), /unavailable/);

const localStorage = {
  values: new Map(),
  getItem(key) { return this.values.get(key) || null; },
  setItem(key, value) { this.values.set(key, String(value)); },
  removeItem(key) { this.values.delete(key); },
};
const localSession = saveSessionRecord({ sessionId: 'legacy-local', sessionNumber: 44, title: 'Legacy', photos: [] }, localStorage);
const legacyLastSession = saveLastSession({ sessionId: 'legacy-last', sessionNumber: 45, title: 'Legacy last-session', photos: [] }, localStorage);
const importedById = new Map();
let importCalls = 0;
const migrationAdapter = {
  async saveSession(session) {
    importCalls += 1;
    const remote = { ...session, sessionNumber: 77 };
    importedById.set(remote.sessionId, remote);
    return remote;
  },
};
assert.deepEqual(findLocalSessionsForD1Import([], localStorage).map((session) => session.sessionId), [localSession.sessionId, legacyLastSession.sessionId]);
await importLocalSessionsToD1({ sessions: [localSession, legacyLastSession], adapter: migrationAdapter, storage: localStorage });
assert.equal(isD1MigrationComplete(localStorage), true);
assert.deepEqual(findLocalSessionsForD1Import([...importedById.values()], localStorage), []);
assert.equal(importCalls, 2, 'migration imports both collection and legacy last-session data');

console.log('D1 schema, CRUD, sanitization, dashboard, API errors, immutable numbering and concurrent allocation passed');
