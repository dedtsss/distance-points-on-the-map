import assert from 'node:assert/strict';
import {
  PROCESSING_STEP_IDS,
  canAdvanceProcessingStep,
  canEnterProcessingStep,
  completeProcessingStep,
  createProcessingWorkflowState,
  deriveProcessingReadiness,
  invalidateProcessingAfter,
  invalidateProcessingFrom,
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


// completed workflow -> recognition rerun -> failure: downstream must be stale/gated
let completedWorkflow = createProcessingWorkflowState('recognition', {
  current: 'recognition',
  completed: ['photos', 'recognition', 'map', 'upload', 'result'],
  stale: [],
});
completedWorkflow = invalidateProcessingFrom(completedWorkflow, 'recognition');
assert.deepEqual(completedWorkflow.completed, ['photos']);
assert.deepEqual(completedWorkflow.stale, ['recognition', 'map', 'upload', 'result']);
const recognitionFailure = deriveProcessingReadiness([{ ...recognized[0], ocrStatus: 'failed', indexFromOcr: '' }]);
assert.equal(canEnterProcessingStep('map', recognitionFailure, completedWorkflow.completed, completedWorkflow.stale), false, 'failed recognition rerun must gate stale Map');
assert.equal(canEnterProcessingStep('upload', recognitionFailure, completedWorkflow.completed, completedWorkflow.stale), false, 'failed recognition rerun must gate stale Upload');
assert.equal(canEnterProcessingStep('result', recognitionFailure, completedWorkflow.completed, completedWorkflow.stale), false, 'failed recognition rerun must gate stale Result');

// completed upload/result -> upload retry failure: old result must be stale and not current
let uploadRetryWorkflow = createProcessingWorkflowState('upload', {
  current: 'upload',
  completed: ['photos', 'recognition', 'map', 'upload', 'result'],
  stale: [],
});
uploadRetryWorkflow = invalidateProcessingFrom(uploadRetryWorkflow, 'upload');
assert.deepEqual(uploadRetryWorkflow.completed, ['photos', 'recognition', 'map']);
assert.deepEqual(uploadRetryWorkflow.stale, ['upload', 'result']);
assert.equal(uploadRetryWorkflow.current, 'upload');
const uploadRetryFailure = deriveProcessingReadiness([{ ...done[0], uploadStatus: 'failed', uploadResult: { links: [] } }]);
assert.equal(uploadRetryFailure.result, false);
assert.equal(canEnterProcessingStep('result', uploadRetryFailure, uploadRetryWorkflow.completed, uploadRetryWorkflow.stale), false, 'failed upload retry must not reopen stale Result');

// confirmed map -> threshold change: Map and dependents must all become stale and current returns to Map
let thresholdWorkflow = createProcessingWorkflowState('result', {
  current: 'result',
  completed: ['photos', 'recognition', 'map', 'upload', 'result'],
  stale: [],
});
thresholdWorkflow = invalidateProcessingFrom(thresholdWorkflow, 'map');
assert.deepEqual(thresholdWorkflow.completed, ['photos', 'recognition']);
assert.deepEqual(thresholdWorkflow.stale, ['map', 'upload', 'result']);
assert.equal(thresholdWorkflow.current, 'map');
assert.equal(canEnterProcessingStep('upload', deriveProcessingReadiness(done), thresholdWorkflow.completed, thresholdWorkflow.stale), false, 'threshold change must gate Upload until Map is reconfirmed');
assert.equal(canEnterProcessingStep('result', deriveProcessingReadiness(done), thresholdWorkflow.completed, thresholdWorkflow.stale), false, 'threshold change must gate Result until Map/upload are reconfirmed');

console.log('Processing workflow tests passed');
