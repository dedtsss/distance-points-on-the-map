export const PHOTO_STATUS = Object.freeze({
  IDLE: 'idle',
  BUFFERED: 'buffered',
  READING_GPS: 'reading_gps',
  GPS_DONE: 'gps_done',
  GPS_MISSING: 'gps_missing',
  DISTANCE_READY: 'distance_ready',
  CLEANING: 'cleaning',
  CLEANED: 'cleaned',
  UPLOADING: 'uploading',
  UPLOADED: 'uploaded',
  FAILED: 'failed',
});

const makePhotoId = () => (
  globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
);

export function createPhotoJob(bufferedFile, index) {
  return {
    id: makePhotoId(),
    number: index + 1,
    fileName: bufferedFile.originalName,
    safeName: bufferedFile.safeName,
    type: bufferedFile.type,
    size: bufferedFile.size,
    status: PHOTO_STATUS.BUFFERED,
    statusText: 'Готово к проверке',
    gpsStatus: 'idle',
    cleanupStatus: 'idle',
    uploadStatus: 'idle',
    coordinates: null,
    latitude: null,
    longitude: null,
    gpsSource: null,
    orientation: 1,
    distanceStatus: 'pending',
    distanceConflicts: [],
    uploadResult: null,
    userError: '',
    debug: {},
    ...bufferedFile,
  };
}

export function releasePhotoBuffers(photo) {
  if (photo?.previewObjectUrl) {
    URL.revokeObjectURL(photo.previewObjectUrl);
  }

  return {
    ...photo,
    sourceBuffer: null,
    stableBlob: null,
    stableFile: null,
    cleanedBlob: null,
    previewObjectUrl: null,
  };
}

export function getProgressSummary(photos) {
  const total = photos.length;
  return {
    total,
    buffered: photos.filter((photo) => photo.status !== PHOTO_STATUS.IDLE).length,
    gps: photos.filter((photo) => ['done', 'missing'].includes(photo.gpsStatus)).length,
    cleaned: photos.filter((photo) => photo.cleanupStatus === 'done').length,
    uploaded: photos.filter((photo) => photo.uploadResult?.links?.length > 0).length,
  };
}
