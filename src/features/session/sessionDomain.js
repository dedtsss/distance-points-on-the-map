export const SESSION_SCHEMA_VERSION = 2;

export const PHOTO_WORK_STATUS = Object.freeze({
  ACTIVE: 'active',
  RESERVE: 'reserve',
});

export const SESSION_STAGES = Object.freeze([
  'processing',
  'upload',
  'map',
  'result',
]);

const nowIso = () => new Date().toISOString();

export const createSessionId = () => (
  globalThis.crypto?.randomUUID?.()
    || `session-${Date.now()}-${Math.random().toString(16).slice(2)}`
);

const cleanText = (value, limit) => String(value || '')
  .replace(/\r\n?/g, '\n')
  .trim()
  .replace(/[\t ]+/g, ' ')
  .slice(0, limit);

export const normalizeSessionTitle = (value) => cleanText(value, 160);
export const normalizeSessionColor = (value) => cleanText(value, 80);
export const normalizeSessionPacking = (value) => cleanText(value, 120);
export const normalizeSessionDescription = (value) => String(value || '')
  .replace(/\r\n?/g, '\n')
  .trim()
  .slice(0, 4000);

export const normalizePhotoWorkStatus = (value) => (
  String(value || '').toLowerCase() === PHOTO_WORK_STATUS.RESERVE
    ? PHOTO_WORK_STATUS.RESERVE
    : PHOTO_WORK_STATUS.ACTIVE
);

export const isReservePhoto = (photo) => normalizePhotoWorkStatus(
  photo?.workStatus || photo?.disposition || photo?.statusGroup,
) === PHOTO_WORK_STATUS.RESERVE;

export const isActivePhoto = (photo) => !isReservePhoto(photo);

export function withPhotoWorkStatus(photo, workStatus, reserveReason = '') {
  const normalized = normalizePhotoWorkStatus(workStatus);
  return {
    ...photo,
    workStatus: normalized,
    disposition: normalized,
    reserveReason: normalized === PHOTO_WORK_STATUS.RESERVE
      ? cleanText(reserveReason || photo?.reserveReason || 'Вручную переведено в резерв', 300)
      : '',
  };
}

export function getSessionMetrics(photos = []) {
  const all = Array.isArray(photos) ? photos : [];
  const active = all.filter(isActivePhoto);
  const reserve = all.filter(isReservePhoto);
  const processed = all.filter((photo) => !['idle', 'buffered'].includes(photo?.status)).length;
  const errors = all.filter((photo) => (
    photo?.status === 'failed'
    || ['failed', 'skipped'].includes(photo?.cleanupStatus)
    || ['failed', 'skipped'].includes(photo?.uploadStatus)
    || Boolean(photo?.userError)
  )).length;
  return {
    totalPhotoCount: all.length,
    processedPhotoCount: processed,
    activeCount: active.length,
    reserveCount: reserve.length,
    recognizedIndexCount: all.filter((photo) => Boolean(photo?.indexFromOcr)).length,
    recognizedCoordinateCount: all.filter((photo) => Boolean(photo?.coordinates)).length,
    uploadedCount: all.filter((photo) => photo?.uploadResult?.links?.length > 0).length,
    errorCount: errors,
    attentionCount: all.filter((photo) => (
      !photo?.coordinates
      || ['low_precision', 'suspicious'].includes(photo?.coordinateQuality)
      || Boolean(photo?.userError)
    )).length,
  };
}

export function deriveSessionStatus(photos = []) {
  const all = Array.isArray(photos) ? photos : [];
  if (all.length === 0) return 'draft';
  if (all.some((photo) => ['reading_gps', 'cleaning', 'uploading'].includes(photo?.status))) return 'processing';
  const metrics = getSessionMetrics(all);
  if (metrics.errorCount > 0 || metrics.attentionCount > 0) return 'attention';
  if (metrics.uploadedCount === metrics.totalPhotoCount) return 'complete';
  return 'in_progress';
}

export function createSession(input = {}) {
  const timestamp = input.createdAt || nowIso();
  const sessionNumber = Math.max(1, Math.floor(Number(input.sessionNumber) || 1));
  const photos = Array.isArray(input.photos) ? input.photos.map((photo) => withPhotoWorkStatus(photo, photo?.workStatus, photo?.reserveReason)) : [];
  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    sessionId: input.sessionId || createSessionId(),
    sessionNumber,
    title: normalizeSessionTitle(input.title || input.name),
    name: normalizeSessionTitle(input.title || input.name),
    color: normalizeSessionColor(input.color),
    packing: normalizeSessionPacking(input.packing),
    description: normalizeSessionDescription(input.description),
    status: input.status || deriveSessionStatus(photos),
    stage: SESSION_STAGES.includes(input.stage) ? input.stage : 'processing',
    createdAt: timestamp,
    updatedAt: input.updatedAt || timestamp,
    thresholdMeters: Math.max(1, Math.min(1000, Number(input.thresholdMeters) || 25)),
    providerSettings: input.providerSettings ? { ...input.providerSettings } : undefined,
    regionMode: input.regionMode || 'auto',
    mapLayerId: input.mapLayerId || '',
    copiedPhotoIds: Array.isArray(input.copiedPhotoIds) ? [...new Set(input.copiedPhotoIds.map(String))] : [],
    photos,
    ...getSessionMetrics(photos),
  };
}

export function updateSessionRecord(session, patch = {}) {
  const photos = patch.photos || session?.photos || [];
  const next = createSession({
    ...session,
    ...patch,
    sessionId: session?.sessionId || patch.sessionId,
    sessionNumber: session?.sessionNumber || patch.sessionNumber,
    createdAt: session?.createdAt || patch.createdAt,
    updatedAt: patch.updatedAt || nowIso(),
    photos,
  });
  return {
    ...next,
    status: patch.status || deriveSessionStatus(next.photos),
  };
}

export function transitionSessionStage(session, stage) {
  const nextStage = SESSION_STAGES.includes(stage) ? stage : session?.stage || 'processing';
  return updateSessionRecord(session, { stage: nextStage });
}

/**
 * Contract for a future cross-session transfer UI. It describes a reversible
 * move without performing it so a transport or confirmation layer can own the
 * mutation safely.
 */
export function createPhotoTransferPlan({ sourceSessionId, targetSessionId, photoId } = {}) {
  return {
    type: 'dark-cat/photo-transfer',
    sourceSessionId: String(sourceSessionId || ''),
    targetSessionId: String(targetSessionId || ''),
    photoId: String(photoId || ''),
    valid: Boolean(sourceSessionId && targetSessionId && photoId && sourceSessionId !== targetSessionId),
  };
}

export function getSessionDisplayName(session) {
  const title = normalizeSessionTitle(session?.title || session?.name);
  return title || `Сессия №${String(session?.sessionNumber || '').padStart(4, '0') || '—'}`;
}

export function getReserveItems(sessions = []) {
  return (sessions || []).flatMap((session) => (session?.photos || [])
    .filter(isReservePhoto)
    .map((photo) => ({
      sessionId: session.sessionId,
      sessionNumber: session.sessionNumber,
      sessionTitle: getSessionDisplayName(session),
      sessionColor: session.color || '',
      sessionPacking: session.packing || '',
      photo,
    })));
}
