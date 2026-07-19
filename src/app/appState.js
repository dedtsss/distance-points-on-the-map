import { applyPointIdentity, normalizeIndexValue } from '../features/points/pointIdentity.js';

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
  return applyPointIdentity({
    id: makePhotoId(),
    number: index + 1,
    fileName: bufferedFile.originalName,
    relativePath: bufferedFile.relativePath || '',
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
    gpsConfidence: 0,
    ocrStatus: 'idle',
    indexFromOcr: null,
    indexStatus: 'missing',
    manualCoordinates: false,
    coordinateQuality: 'missing',
    coordinatePrecision: null,
    coordinateText: null,
    gpsWarnings: [],
    swapSuggested: false,
    ocrAttemptCount: 0,
    orientation: 1,
    distanceStatus: 'pending',
    distanceConflicts: [],
    uploadResult: null,
    userError: '',
    debug: {},
    ...bufferedFile,
  });
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

export function replacePhotoBatch(currentPhotos, bufferedFiles) {
  const releasedPrevious = (currentPhotos || []).map(releasePhotoBuffers);
  const photos = (bufferedFiles || []).map(createPhotoJob);
  return { releasedPrevious, photos };
}

export function getProgressSummary(photos) {
  const total = photos.length;
  return {
    total,
    selected: total,
    ocrAttempts: photos.reduce((sum, photo) => sum + (Number(photo.ocrAttemptCount) || 0), 0),
    confident: photos.filter((photo) => photo.coordinateQuality === 'confident').length,
    lowPrecision: photos.filter((photo) => photo.coordinateQuality === 'low_precision').length,
    suspicious: photos.filter((photo) => photo.coordinateQuality === 'suspicious').length,
    missing: photos.filter((photo) => photo.coordinateQuality === 'missing').length,
    manual: photos.filter((photo) => photo.coordinateQuality === 'manual').length,
    cleaned: photos.filter((photo) => photo.cleanupStatus === 'done').length,
    uploaded: photos.filter((photo) => photo.uploadResult?.links?.length > 0).length,
    errors: photos.filter((photo) => ['failed', 'skipped'].includes(photo.cleanupStatus) || ['failed', 'skipped'].includes(photo.uploadStatus)).length,
  };
}

export function applyManualCoordinateCorrection(photos, photoId, coordinates, calculate) {
  const corrected = photos.map((photo) => photo.id === photoId ? {
    ...photo,
    coordinates,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    gpsStatus: 'done',
    gpsSource: 'manual',
    gpsConfidence: 1,
    ocrStatus: 'manual',
    manualCoordinates: true,
    coordinateQuality: 'manual',
    coordinatePrecision: null,
    coordinateText: null,
    gpsWarnings: [],
    swapSuggested: false,
    userError: '',
  } : photo);
  const distanceResult = calculate(corrected);
  return corrected.map((photo) => ({
    ...photo,
    ...(distanceResult.byPhotoId.get(photo.id) || { distanceStatus: 'missing_coordinates', distanceConflicts: [] }),
  }));
}

export function applyManualIndexCorrection(photos, photoId, value) {
  const normalizedIndex = normalizeIndexValue(value);
  return photos.map((photo) => applyPointIdentity(photo.id === photoId ? {
    ...photo,
    indexFromOcr: normalizedIndex,
    indexStatus: normalizedIndex ? 'manual' : 'missing',
  } : photo));
}
