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
const selected = [{ id: '1', stableFile: {}, gpsStatus: 'idle', cleanupStatus: 'idle', uploadStatus: 'idle', workStatus: 'active' }];
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
state = completeProcessingStep(state, 'recognition');
state = moveProcessingStep(state, 'map', readiness);
assert.equal(state.current, 'map', 'recognition must not reset workflow to photos');
assert.equal(nextProcessingStep('map'), 'upload');

state = completeProcessingStep(completeProcessingStep(state, 'map'), 'upload');
state = invalidateProcessingAfter(state, 'recognition');
assert.deepEqual(state.stale, ['map', 'upload', 'result']);
assert.ok(state.completed.includes('recognition'));
assert.ok(!state.completed.includes('map'));
assert.equal(moveProcessingStep(state, 'recognition', readiness).current, 'recognition', 'completed steps can be reopened');

const done = [{ ...recognized[0], cleanupStatus: 'done', uploadStatus: 'done', uploadResult: { links: [{ url: 'https://example.test/1' }] } }];
readiness = deriveProcessingReadiness(done);
assert.equal(readiness.upload, true);
assert.equal(readiness.result, true);
console.log('Processing workflow tests passed');
