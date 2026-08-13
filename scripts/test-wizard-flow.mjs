import assert from 'node:assert/strict';
import { getPipelineStageOutcome, getStepPrimaryAction } from '../src/features/session/wizardFlow.js';

const photo = (patch = {}) => ({
  ocrStatus: 'confident', cleanupStatus: 'done', uploadStatus: 'done', uploadResult: { links: [{ provider: 'test', url: 'https://example.test/photo' }] },
  ...patch,
});

// Regression: an OCR execution error must leave recognition gated.
assert.deepEqual(
  getPipelineStageOutcome({ photos: [photo({ ocrStatus: 'error' })], stages: { gps: true, cleanup: false, upload: false } }),
  { ok: false, reason: 'recognition_failed' },
);

// Regression: failed metadata cleanup must leave review gated.
assert.deepEqual(
  getPipelineStageOutcome({ photos: [photo({ cleanupStatus: 'failed' })], stages: { gps: false, cleanup: true, upload: false } }),
  { ok: false, reason: 'cleanup_failed' },
);

assert.deepEqual(
  getPipelineStageOutcome({ photos: [photo({ uploadStatus: 'idle', uploadResult: null })], stages: { gps: false, cleanup: false, upload: true } }),
  { ok: false, reason: 'upload_failed' },
);
assert.equal(getPipelineStageOutcome({ photos: [photo()], stages: { gps: true, cleanup: true, upload: true } }).ok, true);

assert.equal(getStepPrimaryAction({ stage: 'result', photos: [photo({ uploadStatus: 'idle', uploadResult: null })] }).label, 'Загрузить очищенные');
assert.equal(getStepPrimaryAction({ stage: 'result', photos: [photo()] }).label, 'Сохранить результат');
assert.equal(getStepPrimaryAction({ stage: 'result', photos: [photo()], resultSavedAt: '2026-08-14T00:00:00.000Z' }).label, 'Результат сохранён');

console.log('Wizard gating and state-aware result action tests passed.');
