export const WIZARD_STAGES = Object.freeze(['select', 'recognition', 'review', 'result']);

export function normalizeWizardStage(stage) {
  if (WIZARD_STAGES.includes(stage)) return stage;
  return ({ upload: 'recognition', map: 'review', result: 'result' }[stage] || 'select');
}

const hasUploadLink = (photo) => Array.isArray(photo?.uploadResult?.links) && photo.uploadResult.links.length > 0;

export const hasUploadedResult = (photos = []) => (
  photos.length > 0 && photos.every((photo) => photo?.uploadStatus === 'done' && hasUploadLink(photo))
);

export function getPipelineStageOutcome({ photos = [], stages = {} } = {}) {
  if (photos.length === 0) return { ok: false, reason: 'no_photos' };
  if (stages.gps && photos.some((photo) => photo?.ocrStatus === 'error')) return { ok: false, reason: 'recognition_failed' };
  if (stages.cleanup && photos.some((photo) => photo?.cleanupStatus === 'failed')) return { ok: false, reason: 'cleanup_failed' };
  if (stages.upload && !hasUploadedResult(photos)) return { ok: false, reason: 'upload_failed' };
  return { ok: true, reason: '' };
}

export function getStepPrimaryAction({ stage = 'select', photos = [], resultSavedAt = '' } = {}) {
  if (stage === 'select') return { id: 'continue', label: 'Продолжить к распознаванию', disabled: photos.length === 0 };
  if (stage === 'recognition') return { id: 'recognize', label: 'Продолжить к проверке', disabled: photos.length === 0 };
  if (stage === 'review') return { id: 'cleanup', label: 'Подготовить очищенные фото', disabled: photos.length === 0 };
  if (!hasUploadedResult(photos)) return { id: 'upload', label: 'Загрузить очищенные', disabled: photos.length === 0 };
  if (!resultSavedAt) return { id: 'save', label: 'Сохранить результат', disabled: false };
  return { id: 'saved', label: 'Результат сохранён', disabled: true };
}
