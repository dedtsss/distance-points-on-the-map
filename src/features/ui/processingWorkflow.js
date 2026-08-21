export const PROCESSING_STEPS = Object.freeze([
  { id: 'photos', label: 'Фотографии' },
  { id: 'recognition', label: 'Распознавание' },
  { id: 'map', label: 'Карта и точки' },
  { id: 'upload', label: 'Очистка и загрузка' },
  { id: 'result', label: 'Результат' },
]);

export const PROCESSING_STEP_IDS = Object.freeze(PROCESSING_STEPS.map((step) => step.id));

const reserve = (photo) => String(photo?.workStatus || photo?.disposition || '').toLowerCase() === 'reserve';
const active = (photo) => !reserve(photo);
const validCoordinates = (photo) => Number.isFinite(Number(photo?.coordinates?.latitude)) && Number.isFinite(Number(photo?.coordinates?.longitude));
const validIndex = (photo) => Boolean(String(photo?.indexFromOcr || '').trim());
const recognitionReady = (photo) => {
  if (reserve(photo)) return true;
  if (!validCoordinates(photo) || !validIndex(photo)) return false;
  if (['failed', 'error', 'missing'].includes(String(photo?.gpsStatus || '').toLowerCase())) return false;
  if (['failed', 'error', 'missing'].includes(String(photo?.ocrStatus || '').toLowerCase()) && photo?.indexStatus !== 'manual' && !photo?.manualCoordinates) return false;
  return true;
};
const cleanupReady = (photo) => photo?.cleanupStatus === 'done';
const uploadReady = (photo) => photo?.uploadStatus === 'done' && (photo?.uploadResult?.links || []).length > 0;

export function deriveProcessingReadiness(photos = []) {
  const all = Array.isArray(photos) ? photos : [];
  const stable = all.filter((photo) => Boolean(photo?.stableFile || photo?.stableBlob || photo?.sourceBuffer));
  const recognizedPhotos = all.filter(recognitionReady);
  const activePhotos = all.filter(active);
  const cleaned = activePhotos.filter(cleanupReady);
  const uploaded = activePhotos.filter(uploadReady);
  const links = activePhotos.filter((photo) => (photo?.uploadResult?.links || []).length > 0);
  return {
    photos: stable.length > 0,
    recognition: all.length > 0 && recognizedPhotos.length === all.length,
    canEnterMap: all.length > 0 && recognizedPhotos.length === all.length,
    map: false,
    upload: activePhotos.length > 0 && cleaned.length === activePhotos.length && uploaded.length === activePhotos.length,
    result: activePhotos.length > 0 && uploaded.length === activePhotos.length,
    counts: {
      total: all.length,
      stable: stable.length,
      recognized: recognizedPhotos.length,
      attention: all.filter((photo) => !recognitionReady(photo) || ['low_precision', 'suspicious'].includes(photo?.coordinateQuality) || Boolean(photo?.userError)).length,
      active: activePhotos.length,
      cleaned: cleaned.length,
      uploaded: uploaded.length,
      links: links.length,
    },
  };
}

export function canEnterProcessingStep(stepId, readiness, completed = [], stale = []) {
  const index = PROCESSING_STEP_IDS.indexOf(stepId);
  if (index < 0) return false;
  if (index === 0) return true;
  if ((completed || []).includes(stepId)) return true;
  const previous = PROCESSING_STEP_IDS[index - 1];
  if ((stale || []).includes(previous)) return false;
  if ((completed || []).includes(previous)) return true;
  if (stepId === 'map') return Boolean(readiness?.canEnterMap ?? readiness?.recognition);
  return Boolean(readiness?.[previous]);
}

export function canAdvanceProcessingStep(stepId, readiness) {
  return Boolean(readiness?.[stepId]);
}

export function nextProcessingStep(stepId) {
  const index = PROCESSING_STEP_IDS.indexOf(stepId);
  return index >= 0 && index < PROCESSING_STEP_IDS.length - 1 ? PROCESSING_STEP_IDS[index + 1] : null;
}

export function createProcessingWorkflowState(step = 'photos', persisted = null) {
  const source = persisted && typeof persisted === 'object' ? persisted : {};
  return {
    current: PROCESSING_STEP_IDS.includes(source.current) ? source.current : (PROCESSING_STEP_IDS.includes(step) ? step : 'photos'),
    completed: Array.isArray(source.completed) ? source.completed.filter((id) => PROCESSING_STEP_IDS.includes(id)) : [],
    stale: Array.isArray(source.stale) ? source.stale.filter((id) => PROCESSING_STEP_IDS.includes(id)) : [],
  };
}

export function completeProcessingStep(state, stepId) {
  const completed = [...new Set([...(state?.completed || []), stepId])].filter((id) => PROCESSING_STEP_IDS.includes(id));
  const stale = (state?.stale || []).filter((id) => id !== stepId);
  return { ...state, completed, stale };
}

export function moveProcessingStep(state, stepId, readiness) {
  if (!canEnterProcessingStep(stepId, readiness, state?.completed, state?.stale)) return state;
  return { ...state, current: stepId };
}


export function invalidateProcessingFrom(state, sourceStep) {
  const index = PROCESSING_STEP_IDS.indexOf(sourceStep);
  if (index < 0) return state;
  const affected = PROCESSING_STEP_IDS.slice(index);
  return {
    ...state,
    stale: [...new Set([...(state?.stale || []), ...affected])],
    completed: (state?.completed || []).filter((id) => !affected.includes(id)),
    current: affected.includes(state?.current) ? sourceStep : state?.current,
  };
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
