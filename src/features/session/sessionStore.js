import { PHOTO_STATUS } from '../../app/appState.js';
import { MAX_SESSION_THUMBNAIL_LENGTH } from '../files/thumbnail.js';

export const LAST_SESSION_KEY = 'gps-checker-last-session-v1';

const nowIso = () => new Date().toISOString();
const makeSessionId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const cleanLinks = (links) => (Array.isArray(links) ? links : []).map((link) => ({
  provider: link.provider,
  role: link.role,
  url: link.url,
  directUrl: link.directUrl,
  replaces: Array.isArray(link.replaces) ? [...link.replaces] : [],
})).filter((link) => link.url);

const serializeUploadResult = (result) => {
  if (!result) return null;
  return {
    links: cleanLinks(result.links),
    freeimageUrl: result.freeimageUrl || '',
    ninjaboxUrl: result.ninjaboxUrl || '',
    fallbackUrl: result.fallbackUrl || '',
    x0Url: result.x0Url || result.fallbackUrl || '',
    ninjaboxGalleryUrl: result.ninjaboxGalleryUrl || '',
    requestedProviders: Array.isArray(result.requestedProviders) ? [...result.requestedProviders] : [],
    includeX0: result.includeX0 === true,
    fallback: result.fallback || 'x0',
    complete: result.complete === true,
    partial: result.partial === true,
    uploadWarnings: Array.isArray(result.uploadWarnings) ? [...result.uploadWarnings] : [],
  };
};

export function serializePhotoForSession(photo) {
  const uploadResult = serializeUploadResult(photo.uploadResult);
  return {
    photoId: photo.id || photo.photoId || '',
    number: photo.number,
    fileName: photo.fileName || '',
    safeName: photo.safeName || '',
    size: Number(photo.size) || 0,
    coordinates: photo.coordinates ? { ...photo.coordinates } : null,
    gpsSource: photo.gpsSource || null,
    gpsStatus: photo.gpsStatus || 'idle',
    gpsConfidence: Number(photo.gpsConfidence) || 0,
    ocrStatus: photo.ocrStatus || 'idle',
    manualCoordinates: photo.manualCoordinates === true,
    coordinateQuality: photo.coordinateQuality || 'missing',
    swapSuggested: photo.swapSuggested === true,
    ocrAttemptCount: Number(photo.ocrAttemptCount) || 0,
    status: photo.status || PHOTO_STATUS.IDLE,
    distanceStatus: photo.distanceStatus || 'pending',
    distanceConflicts: Array.isArray(photo.distanceConflicts) ? [...photo.distanceConflicts] : [],
    cleanupStatus: photo.cleanupStatus || 'idle',
    uploadStatus: photo.uploadStatus || 'idle',
    statusText: photo.statusText || '',
    userError: photo.userError || '',
    userWarnings: Array.isArray(photo.userWarnings) ? [...photo.userWarnings] : [],
    uploadResult,
    freeimageUrl: uploadResult?.freeimageUrl || '',
    ninjaboxUrl: uploadResult?.ninjaboxUrl || '',
    fallbackUrl: uploadResult?.fallbackUrl || '',
    ninjaboxGalleryUrl: uploadResult?.ninjaboxGalleryUrl || '',
    thumbnailDataUrl: typeof photo.thumbnailDataUrl === 'string'
      && photo.thumbnailDataUrl.length <= MAX_SESSION_THUMBNAIL_LENGTH
      ? photo.thumbnailDataUrl
      : null,
  };
}

export function getSessionDiagnostics(storage = globalThis.localStorage) {
  const raw = storage?.getItem(LAST_SESSION_KEY);
  if (!raw) return { found: false, accepted: false, reason: 'key_not_found', version: null, photoCount: 0 };
  try {
    const parsed = JSON.parse(raw);
    const accepted = Boolean(parsed?.sessionId && Array.isArray(parsed.photos));
    return { found: true, accepted, reason: accepted ? null : 'invalid_shape', version: parsed?.version || null, photoCount: parsed?.photos?.length || 0 };
  } catch {
    return { found: true, accepted: false, reason: 'invalid_json', version: null, photoCount: 0 };
  }
}

export function createSessionSnapshot({ sessionId, createdAt, thresholdMeters, photos, providerSettings }) {
  const timestamp = nowIso();
  return {
    version: 1,
    sessionId: sessionId || makeSessionId(),
    createdAt: createdAt || timestamp,
    updatedAt: timestamp,
    thresholdMeters,
    providerSettings: providerSettings ? { ...providerSettings } : undefined,
    photos: (photos || []).map(serializePhotoForSession),
  };
}

export function saveLastSession(input, storage = globalThis.localStorage) {
  const snapshot = createSessionSnapshot(input);
  try {
    storage?.setItem(LAST_SESSION_KEY, JSON.stringify(snapshot));
  } catch {
    snapshot.photos = snapshot.photos.map((photo) => ({ ...photo, thumbnailDataUrl: null }));
    storage?.setItem(LAST_SESSION_KEY, JSON.stringify(snapshot));
  }
  return snapshot;
}

export function loadLastSession(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage?.getItem(LAST_SESSION_KEY) || 'null');
    if (!parsed?.sessionId || !Array.isArray(parsed.photos)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function deleteLastSession(storage = globalThis.localStorage) {
  storage?.removeItem(LAST_SESSION_KEY);
}

export function restoreSessionPhotos(session) {
  return (session?.photos || []).map((photo, index) => {
    const uploadResult = photo.uploadResult ? {
      ...photo.uploadResult,
      freeimageUrl: photo.uploadResult.freeimageUrl || photo.freeimageUrl || '',
      ninjaboxUrl: photo.uploadResult.ninjaboxUrl || photo.ninjaboxUrl || '',
      fallbackUrl: photo.uploadResult.fallbackUrl || photo.fallbackUrl || '',
      ninjaboxGalleryUrl: photo.uploadResult.ninjaboxGalleryUrl || photo.ninjaboxGalleryUrl || '',
    } : null;
    return {
      id: photo.photoId || `restored-${session.sessionId}-${photo.number || index + 1}`,
      number: photo.number || index + 1,
      fileName: photo.fileName,
      safeName: photo.safeName,
      size: photo.size,
      type: '',
      status: photo.status || (uploadResult?.links?.length ? PHOTO_STATUS.UPLOADED : PHOTO_STATUS.FAILED),
      statusText: photo.statusText,
      gpsStatus: photo.gpsStatus || (photo.coordinates ? 'done' : 'missing'),
      cleanupStatus: photo.cleanupStatus,
      uploadStatus: photo.uploadStatus,
      coordinates: photo.coordinates,
      latitude: photo.coordinates?.latitude ?? null,
      longitude: photo.coordinates?.longitude ?? null,
      gpsSource: photo.gpsSource,
      gpsConfidence: Number(photo.gpsConfidence) || 0,
      ocrStatus: photo.ocrStatus || (photo.coordinates ? 'uncertain' : 'missing'),
      manualCoordinates: photo.manualCoordinates === true,
      coordinateQuality: photo.coordinateQuality || (photo.manualCoordinates ? 'manual' : photo.coordinates ? 'suspicious' : 'missing'),
      swapSuggested: photo.swapSuggested === true,
      ocrAttemptCount: Number(photo.ocrAttemptCount) || 0,
      orientation: 1,
      distanceStatus: photo.distanceStatus,
      distanceConflicts: photo.distanceConflicts || [],
      uploadResult,
      userError: photo.userError,
      userWarnings: photo.userWarnings || [],
      thumbnailDataUrl: photo.thumbnailDataUrl || null,
      sourceBuffer: null,
      stableBlob: null,
      stableFile: null,
      cleanedBlob: null,
      previewObjectUrl: null,
      debug: {},
      restored: true,
      canResumeUpload: false,
    };
  });
}
