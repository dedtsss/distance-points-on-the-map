import assert from 'node:assert/strict';
import {
  PROCESSING_STEP_IDS,
  canAdvanceProcessingStep,
  canEnterProcessingStep,
  completeProcessingStep,
  createProcessingWorkflowState,
  deriveProcessingReadiness,
  invalidateProcessingAfter,
  moveProcessingStep,
  nextProcessingStep,
} from '../src/features/ui/processingWorkflow.js';

assert.deepEqual(PROCESSING_STEP_IDS, ['photos', 'recognition', 'map', 'upload', 'result']);
const selected = [{ id: '1', stableFile: {}, gpsStatus: 'idle', ocrStatus: 'idle', cleanupStatus: 'idle', uploadStatus: 'idle', workStatus: 'active' }];
let readiness = deriveProcessingReadiness(selected);
assert.equal(readiness.photos, true);
assert.equal(readiness.recognition, false);
assert.equal(canAdvanceProcessingStep('photos', readiness), true);
assert.equal(canEnterProcessingStep('recognition', readiness), true);
assert.equal(canEnterProcessingStep('map', readiness), false);
let state = createProcessingWorkflowState();
state = completeProcessingStep(state, 'photos');
state = moveProcessingStep(state, 'recognition', readiness);
assert.equal(state.current, 'recognition');

const recognized = [{ ...selected[0], gpsStatus: 'done', ocrStatus: 'confident', coordinates: { latitude: 1, longitude: 2 }, indexFromOcr: '7', ocrAttemptCount: 1 }];
readiness = deriveProcessingReadiness(recognized);
assert.equal(readiness.recognition, true);
assert.equal(readiness.canEnterMap, true);
assert.equal(readiness.map, false, 'Map must never auto-complete from recognition readiness');
state = completeProcessingStep(state, 'recognition');
state = moveProcessingStep(state, 'map', readiness);
assert.equal(state.current, 'map', 'recognition must allow entering map');
assert.equal(canEnterProcessingStep('upload', readiness, state.completed), false, 'upload stays gated until Map is explicitly completed');
state = completeProcessingStep(state, 'map');
assert.equal(canEnterProcessingStep('upload', readiness, state.completed), true, 'explicit Map completion unlocks upload');
assert.equal(nextProcessingStep('map'), 'upload');

for (const [label, patch] of [
  ['missing coords', { coordinates: null }],
  ['missing index', { indexFromOcr: '' }],
  ['failed OCR', { ocrStatus: 'failed' }],
  ['missing OCR', { ocrStatus: 'missing' }],
]) {
  const invalid = deriveProcessingReadiness([{ ...recognized[0], ...patch }]);
  assert.equal(invalid.recognition, false, `${label} must block recognition readiness`);
  assert.equal(invalid.canEnterMap, false, `${label} must block Map entry`);
}
const reserveException = deriveProcessingReadiness([{ ...recognized[0], coordinates: null, indexFromOcr: '', ocrStatus: 'failed', workStatus: 'reserve' }]);
assert.equal(reserveException.recognition, true, 'explicit RESERVE is excluded from recognition gating');

state = completeProcessingStep(state, 'upload');
state = invalidateProcessingAfter(state, 'recognition');
assert.deepEqual(state.stale, ['map', 'upload', 'result']);
assert.ok(state.completed.includes('recognition'));
assert.ok(!state.completed.includes('map'));
const restored = createProcessingWorkflowState('photos', { current: 'map', completed: ['photos', 'recognition'], stale: ['map'] });
assert.deepEqual(restored, { current: 'map', completed: ['photos', 'recognition'], stale: ['map'] }, 'presentation workflow must restore current/completed/stale');

const done = [{ ...recognized[0], cleanupStatus: 'done', uploadStatus: 'done', uploadResult: { links: [{ url: 'https://example.test/1' }] } }];
readiness = deriveProcessingReadiness(done);
assert.equal(readiness.upload, true);
assert.equal(readiness.result, true);

const tenActive = Array.from({ length: 10 }, (_, index) => ({
  ...done[0], id: String(index + 1), indexFromOcr: String(index + 1),
  uploadStatus: index === 9 ? 'failed' : 'done',
  uploadResult: index === 9 ? null : { links: [{ url: `https://example.test/${index + 1}` }] },
}));
readiness = deriveProcessingReadiness(tenActive);
assert.equal(readiness.upload, false, '9 successful + 1 failed ACTIVE upload must not be upload-ready');
assert.equal(readiness.result, false, '9 successful + 1 failed ACTIVE upload must not expose result readiness');
assert.equal(readiness.counts.uploaded, 9);

const failedCleanup = deriveProcessingReadiness([{ ...done[0], cleanupStatus: 'failed' }]);
assert.equal(failedCleanup.upload, false, 'failed cleanup is settled but not ready');
const skippedUpload = deriveProcessingReadiness([{ ...done[0], uploadStatus: 'skipped' }]);
assert.equal(skippedUpload.upload, false, 'skipped upload is settled but not ready');
assert.equal(skippedUpload.result, false);
console.log('Processing workflow tests passed');
