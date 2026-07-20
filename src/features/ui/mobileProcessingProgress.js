export const PHOTO_PROGRESS_EVENT = 'gps-photo-progress';

const ACTIVE_STAGE_BY_STATUS = Object.freeze({
  reading_gps: 'gps',
  cleaning: 'cleanup',
  uploading: 'upload',
});

const STAGE_META = Object.freeze({
  gps: {
    label: 'OCR',
    terminalValues: new Set(['done', 'missing', 'low_precision', 'manual', 'error']),
    valueKey: 'gpsStatus',
    fallbackProgress: 0.42,
  },
  cleanup: {
    label: 'Очистка',
    terminalValues: new Set(['done', 'failed', 'skipped']),
    valueKey: 'cleanupStatus',
    fallbackProgress: 0.4,
  },
  upload: {
    label: 'Загрузка',
    terminalValues: new Set(['done', 'partial', 'failed', 'skipped']),
    valueKey: 'uploadStatus',
    fallbackProgress: 0.35,
  },
});

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

const stageForEntry = (entry) => (
  ACTIVE_STAGE_BY_STATUS[entry?.status]
  || (entry?.gpsStatus === 'processing' ? 'gps' : null)
  || (entry?.cleanupStatus === 'processing' ? 'cleanup' : null)
  || (entry?.uploadStatus === 'processing' ? 'upload' : null)
);

const progressFromText = (text, fallback) => {
  const value = String(text || '');
  const match = value.match(/(\d{1,3})\s*%/);
  if (match) return clamp(Number(match[1]) / 100, 0.02, 0.98);
  if (/подготов/i.test(value)) return 0.16;
  if (/распознаван/i.test(value)) return 0.5;
  return fallback;
};

export const progressEntryFromDataset = (dataset = {}) => ({
  id: dataset.photoId || '',
  number: Number(dataset.photoNumber) || 0,
  status: dataset.photoStatus || '',
  statusText: dataset.photoStatusText || '',
  gpsStatus: dataset.photoGpsStatus || '',
  cleanupStatus: dataset.photoCleanupStatus || '',
  uploadStatus: dataset.photoUploadStatus || '',
});

export function deriveMobileProcessingProgress(entries = [], totalPhotos = entries.length) {
  const normalizedEntries = (entries || [])
    .filter(Boolean)
    .map((entry) => ({ ...entry, number: Number(entry.number) || 0 }));
  const active = normalizedEntries
    .map((entry) => ({ entry, stage: stageForEntry(entry) }))
    .filter((item) => item.stage)
    .sort((left, right) => left.entry.number - right.entry.number)[0];

  if (!active) return null;

  const stageMeta = STAGE_META[active.stage];
  const total = Math.max(1, Number(totalPhotos) || normalizedEntries.length || 1);
  const completed = normalizedEntries.filter((entry) => (
    stageMeta.terminalValues.has(String(entry[stageMeta.valueKey] || ''))
  )).length;
  const currentFraction = progressFromText(active.entry.statusText, stageMeta.fallbackProgress);
  const percent = clamp(((completed + currentFraction) / total) * 100, 1, 99);

  return {
    photoNumber: active.entry.number || Math.min(total, completed + 1),
    totalPhotos: total,
    stage: active.stage,
    stageLabel: stageMeta.label,
    statusText: active.entry.statusText || stageMeta.label,
    percent: Number(percent.toFixed(1)),
    percentRounded: Math.round(percent),
    completedPhotos: completed,
  };
}
