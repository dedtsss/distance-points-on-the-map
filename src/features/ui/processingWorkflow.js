export const PROCESSING_STEPS = Object.freeze([
  { id: 'photos', label: 'Фотографии' },
  { id: 'recognition', label: 'Распознавание' },
  { id: 'map', label: 'Карта и точки' },
  { id: 'upload', label: 'Очистка и загрузка' },
  { id: 'result', label: 'Результат' },
]);

export const PROCESSING_STEP_IDS = Object.freeze(PROCESSING_STEPS.map((step) => step.id));

const recognized = (photo) => (
  photo?.gpsStatus && !['idle', 'processing'].includes(photo.gpsStatus)
) || (photo?.ocrStatus && !['idle', 'processing'].includes(photo.ocrStatus))
  || Boolean(photo?.coordinates)
  || Number(photo?.ocrAttemptCount) > 0;

const active = (photo) => !['reserve'].includes(String(photo?.workStatus || photo?.disposition || '').toLowerCase());

export function deriveProcessingReadiness(photos = []) {
  const all = Array.isArray(photos) ? photos : [];
  const stable = all.filter((photo) => Boolean(photo?.stableFile || photo?.stableBlob || photo?.sourceBuffer));
  const recognizedPhotos = all.filter(recognized);
  const activePhotos = all.filter(active);
  const cleanupSettled = activePhotos.filter((photo) => ['done', 'failed', 'skipped'].includes(photo?.cleanupStatus));
  const uploadSettled = activePhotos.filter((photo) => ['done', 'failed', 'skipped'].includes(photo?.uploadStatus) || Boolean(photo?.uploadResult));
  const links = activePhotos.filter((photo) => (photo?.uploadResult?.links || []).length > 0);
  return {
    photos: stable.length > 0,
    recognition: all.length > 0 && recognizedPhotos.length === all.length,
    map: all.length > 0 && recognizedPhotos.length === all.length,
    upload: activePhotos.length > 0 && cleanupSettled.length === activePhotos.length && uploadSettled.length === activePhotos.length,
    result: activePhotos.length > 0 && links.length > 0,
    counts: {
      total: all.length,
      stable: stable.length,
      recognized: recognizedPhotos.length,
      attention: all.filter((photo) => !photo?.coordinates || ['low_precision', 'suspicious'].includes(photo?.coordinateQuality) || Boolean(photo?.userError)).length,
      active: activePhotos.length,
      cleaned: cleanupSettled.length,
      uploaded: uploadSettled.length,
      links: links.length,
    },
  };
}

export function canEnterProcessingStep(stepId, readiness, completed = []) {
  const index = PROCESSING_STEP_IDS.indexOf(stepId);
  if (index < 0) return false;
  if (index === 0) return true;
  if ((completed || []).includes(stepId)) return true;
  const previous = PROCESSING_STEP_IDS[index - 1];
  return Boolean(readiness?.[previous]);
}

export function canAdvanceProcessingStep(stepId, readiness) {
  return Boolean(readiness?.[stepId]);
}

export function nextProcessingStep(stepId) {
  const index = PROCESSING_STEP_IDS.indexOf(stepId);
  return index >= 0 && index < PROCESSING_STEP_IDS.length - 1 ? PROCESSING_STEP_IDS[index + 1] : null;
}

export function createProcessingWorkflowState(step = 'photos') {
  return { current: PROCESSING_STEP_IDS.includes(step) ? step : 'photos', completed: [], stale: [] };
}

export function completeProcessingStep(state, stepId) {
  const completed = [...new Set([...(state?.completed || []), stepId])].filter((id) => PROCESSING_STEP_IDS.includes(id));
  const stale = (state?.stale || []).filter((id) => id !== stepId);
  return { ...state, completed, stale };
}

export function moveProcessingStep(state, stepId, readiness) {
  if (!canEnterProcessingStep(stepId, readiness, state?.completed)) return state;
  return { ...state, current: stepId };
}

export function invalidateProcessingAfter(state, sourceStep) {
  const index = PROCESSING_STEP_IDS.indexOf(sourceStep);
  if (index < 0) return state;
  const downstream = PROCESSING_STEP_IDS.slice(index + 1);
  return {
    ...state,
    stale: [...new Set([...(state?.stale || []), ...downstream])],
    completed: (state?.completed || []).filter((id) => !downstream.includes(id)),
  };
}
