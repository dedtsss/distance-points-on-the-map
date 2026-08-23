const SEQUENCE_NAME = 'sessions';
const MAX_SESSION_ID_LENGTH = 120;
const MAX_PHOTOS_PER_SESSION = 500;
const MAX_TEXT_LENGTH = 12_000;

const json = (value) => JSON.stringify(value ?? null);
const parseJson = (value, fallback) => {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
};

const cleanText = (value, max = MAX_TEXT_LENGTH) => String(value ?? '')
  .replace(/\u0000/g, '')
  .slice(0, max);

const validSessionId = (value) => (
  typeof value === 'string'
  && value.length > 0
  && value.length <= MAX_SESSION_ID_LENGTH
  && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
);

const cleanJsonValue = (value, key = '') => {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') {
    if (/^data:/i.test(value)) return undefined;
    return cleanText(value);
  }
  if (Array.isArray(value)) return value.map((item) => cleanJsonValue(item)).filter((item) => item !== undefined);
  if (typeof value === 'object') {
    if (/thumbnail(dataurl|_data_url)|source(buffer)?|stable(blob|file)|cleaned(blob|file)|preview(objecturl|_object_url)|raw(debug|ocr)/i.test(key)) return undefined;
    return Object.fromEntries(Object.entries(value)
      .map(([childKey, childValue]) => [childKey, cleanJsonValue(childValue, childKey)])
      .filter(([, childValue]) => childValue !== undefined));
  }
  return undefined;
};

const normalizeWorkStatus = (photo) => (
  photo?.workStatus === 'reserve' || photo?.disposition === 'reserve' ? 'reserve' : 'active'
);

const sanitizePhoto = (photo = {}) => {
  const cleaned = cleanJsonValue(photo) || {};
  delete cleaned.thumbnailDataUrl;
  delete cleaned.sourceBuffer;
  delete cleaned.stableBlob;
  delete cleaned.stableFile;
  delete cleaned.cleanedBlob;
  delete cleaned.previewObjectUrl;
  delete cleaned.debug;
  return cleaned;
};

const photoRow = (session, photo, now) => {
  const cleaned = sanitizePhoto(photo);
  const coordinates = cleaned.coordinates || {};
  return [
    String(cleaned.photoId || cleaned.id || ''),
    session.sessionId,
    Math.max(1, Math.floor(Number(cleaned.number) || 1)),
    cleanText(cleaned.fileName, 512),
    cleanText(cleaned.processedFileName, 512),
    cleaned.indexFromOcr ? cleanText(cleaned.indexFromOcr, 120) : null,
    coordinates.latitude ?? null,
    coordinates.longitude ?? null,
    cleanText(cleaned.gpsSource || 'unavailable', 80),
    cleanText(cleaned.ocrStatus || 'idle', 80),
    cleanText(cleaned.cleanupStatus || 'idle', 80),
    cleanText(cleaned.uploadStatus || 'idle', 80),
    json(cleaned.uploadResult?.links || []),
    normalizeWorkStatus(cleaned),
    cleaned.reserveReason ? cleanText(cleaned.reserveReason, 300) : null,
    typeof cleaned.thumbnailReference === 'string' && /^https?:\/\//i.test(cleaned.thumbnailReference)
      ? cleanText(cleaned.thumbnailReference, 2000)
      : null,
    json(cleaned),
    now,
    now,
  ];
};

const normalizeProcessingWorkflow = (value) => {
  const allowed = ['photos', 'recognition', 'map', 'upload', 'result'];
  if (!value || typeof value !== 'object') return undefined;
  return {
    current: allowed.includes(value.current) ? value.current : 'photos',
    completed: Array.isArray(value.completed) ? [...new Set(value.completed.filter((id) => allowed.includes(id)))] : [],
    stale: Array.isArray(value.stale) ? [...new Set(value.stale.filter((id) => allowed.includes(id)))] : [],
  };
};

const normalizeSession = (session = {}, sessionNumber, now) => {
  const photos = Array.isArray(session.photos) ? session.photos.slice(0, MAX_PHOTOS_PER_SESSION) : [];
  return {
    ...session,
    sessionId: session.sessionId,
    sessionNumber,
    title: cleanText(session.title || session.name, 160),
    name: cleanText(session.title || session.name, 160),
    color: cleanText(session.color, 80),
    packing: cleanText(session.packing, 120),
    description: cleanText(session.description, 4000),
    status: cleanText(session.status || 'draft', 40),
    stage: ['processing', 'upload', 'map', 'result'].includes(session.stage) ? session.stage : 'processing',
    thresholdMeters: Math.max(1, Math.min(1000, Number(session.thresholdMeters) || 25)),
    settings: {
      providerSettings: cleanJsonValue(session.providerSettings || {}) || {},
      processingSettings: {
        metadataCleanup: session.processingSettings?.metadataCleanup !== false,
        renameFiles: session.processingSettings?.renameFiles !== false,
        metadataFirst: session.processingSettings?.metadataFirst !== false,
      },
      regionMode: cleanText(session.regionMode || 'auto', 40),
      mapLayerId: cleanText(session.mapLayerId, 80),
      copiedPhotoIds: Array.isArray(session.copiedPhotoIds) ? [...new Set(session.copiedPhotoIds.map(String).slice(0, 500))] : [],
      activeScreen: cleanText(session.activeScreen || 'upload', 40),
      processingWorkflow: normalizeProcessingWorkflow(session.processingWorkflow),
    },
    photos,
    createdAt: session.createdAt || now,
  };
};

const sessionRow = (session, now) => [
  session.sessionId,
  session.sessionNumber,
  session.title,
  session.color,
  session.packing,
  session.description,
  session.status,
  session.stage,
  session.thresholdMeters,
  json(session.settings),
  session.createdAt,
  now,
];

export function validateD1SessionInput(session = {}) {
  if (!validSessionId(session.sessionId)) throw new Error('Invalid session id.');
  if (!Array.isArray(session.photos)) throw new Error('Session photos must be an array.');
  if (session.photos.length > MAX_PHOTOS_PER_SESSION) throw new Error('Too many photos in session.');
  const photoIds = new Set();
  session.photos.forEach((photo) => {
    const photoId = String(photo?.photoId || photo?.id || '');
    if (!validSessionId(photoId)) throw new Error('Invalid photo id.');
    if (photoIds.has(photoId)) throw new Error('Duplicate photo id.');
    photoIds.add(photoId);
  });
  return true;
}

async function ensureSequence(db) {
  await db.prepare(`INSERT OR IGNORE INTO crm_sequences (sequence_name, next_value) VALUES (?, 1)`)
    .bind(SEQUENCE_NAME).run();
}

async function allocateSessionNumber(db) {
  await ensureSequence(db);
  const result = await db.prepare(`
    UPDATE crm_sequences
    SET next_value = next_value + 1
    WHERE sequence_name = ?
    RETURNING next_value - 1 AS session_number
  `).bind(SEQUENCE_NAME).first();
  const sessionNumber = Number(result?.session_number);
  if (!Number.isInteger(sessionNumber) || sessionNumber < 1) throw new Error('Session number allocation failed.');
  return sessionNumber;
}

const photoFromRow = (row) => {
  const payload = parseJson(row.diagnostics_json, {});
  const coordinates = row.latitude === null || row.longitude === null
    ? payload.coordinates || null
    : { latitude: row.latitude, longitude: row.longitude };
  return {
    ...payload,
    photoId: row.photo_id,
    id: row.photo_id,
    number: row.ordinal,
    fileName: row.original_file_name,
    processedFileName: row.processed_file_name || payload.processedFileName || '',
    indexFromOcr: row.ocr_index || payload.indexFromOcr || null,
    coordinates,
    latitude: coordinates?.latitude ?? null,
    longitude: coordinates?.longitude ?? null,
    gpsSource: row.coordinate_source || payload.gpsSource || 'unavailable',
    ocrStatus: row.ocr_status || payload.ocrStatus || 'idle',
    cleanupStatus: row.cleanup_status || payload.cleanupStatus || 'idle',
    uploadStatus: row.upload_status || payload.uploadStatus || 'idle',
    uploadResult: { ...(payload.uploadResult || {}), links: parseJson(row.links_json, []) },
    workStatus: row.work_status,
    disposition: row.work_status,
    reserveReason: row.reserve_reason || '',
    thumbnailReference: row.thumbnail_reference || null,
    thumbnailDataUrl: null,
    restored: true,
    canResumeUpload: false,
  };
};

const sessionFromRow = (row, photosBySession) => {
  const settings = parseJson(row.settings_json, {});
  const photos = photosBySession.get(row.session_id) || [];
  return {
    sessionId: row.session_id,
    sessionNumber: row.session_number,
    title: row.title || '',
    name: row.title || '',
    color: row.color || '',
    packing: row.packing || '',
    description: row.description || '',
    status: row.status,
    stage: row.stage,
    thresholdMeters: row.threshold_meters,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...settings,
    photos,
  };
};

export async function listD1Sessions(db) {
  if (!db?.prepare) throw new Error('D1 binding is unavailable.');
  const sessions = (await db.prepare('SELECT * FROM crm_sessions ORDER BY updated_at DESC, session_number DESC').all()).results || [];
  const photos = (await db.prepare('SELECT * FROM crm_photo_items ORDER BY session_id, ordinal').all()).results || [];
  const photosBySession = new Map();
  photos.forEach((row) => {
    const items = photosBySession.get(row.session_id) || [];
    items.push(photoFromRow(row));
    photosBySession.set(row.session_id, items);
  });
  return sessions.map((row) => sessionFromRow(row, photosBySession));
}

export async function getD1Session(db, sessionId) {
  if (!validSessionId(sessionId)) return null;
  const row = await db.prepare('SELECT * FROM crm_sessions WHERE session_id = ?').bind(sessionId).first();
  if (!row) return null;
  const photos = (await db.prepare('SELECT * FROM crm_photo_items WHERE session_id = ? ORDER BY ordinal').bind(sessionId).all()).results || [];
  return sessionFromRow(row, new Map([[sessionId, photos.map(photoFromRow)]]));
}

export async function upsertD1Session(db, input) {
  if (!db?.prepare) throw new Error('D1 binding is unavailable.');
  validateD1SessionInput(input);
  const existing = await db.prepare('SELECT session_number, created_at FROM crm_sessions WHERE session_id = ?')
    .bind(input.sessionId).first();
  const now = new Date().toISOString();
  const sessionNumber = Number(existing?.session_number) || await allocateSessionNumber(db);
  const session = normalizeSession({ ...input, sessionNumber, createdAt: existing?.created_at || input.createdAt }, sessionNumber, now);
  const statements = [
    db.prepare(`INSERT INTO crm_sessions (
      session_id, session_number, title, color, packing, description, status, stage,
      threshold_meters, settings_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      title = excluded.title, color = excluded.color, packing = excluded.packing,
      description = excluded.description, status = excluded.status, stage = excluded.stage,
      threshold_meters = excluded.threshold_meters, settings_json = excluded.settings_json,
      updated_at = excluded.updated_at`).bind(...sessionRow(session, now)),
    db.prepare('DELETE FROM crm_photo_items WHERE session_id = ?').bind(session.sessionId),
  ];
  session.photos.forEach((photo) => statements.push(db.prepare(`INSERT INTO crm_photo_items (
    photo_id, session_id, ordinal, original_file_name, processed_file_name, ocr_index,
    latitude, longitude, coordinate_source, ocr_status, cleanup_status, upload_status,
    links_json, work_status, reserve_reason, thumbnail_reference, diagnostics_json, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(...photoRow(session, photo, now))));
  await db.batch(statements);
  return getD1Session(db, session.sessionId);
}

export async function deleteD1Session(db, sessionId) {
  if (!validSessionId(sessionId)) return false;
  const result = await db.prepare('DELETE FROM crm_sessions WHERE session_id = ?').bind(sessionId).run();
  return Number(result?.meta?.changes || 0) > 0;
}

export function getD1Dashboard(sessions = []) {
  const photos = sessions.flatMap((session) => session.photos || []);
  const active = photos.filter((photo) => photo.workStatus !== 'reserve');
  const reserve = photos.filter((photo) => photo.workStatus === 'reserve');
  return {
    sessionCount: sessions.length,
    photoCount: photos.length,
    activeCount: active.length,
    reserveCount: reserve.length,
    uploadedCount: photos.filter((photo) => photo.uploadResult?.links?.length > 0).length,
    attentionCount: photos.filter((photo) => !photo.coordinates || photo.coordinateQuality === 'suspicious' || photo.userError).length,
  };
}

export async function getD1SessionPayload(db) {
  const sessions = await listD1Sessions(db);
  const next = await db.prepare('SELECT next_value FROM crm_sequences WHERE sequence_name = ?').bind(SEQUENCE_NAME).first();
  return {
    sessions,
    nextSessionNumber: Math.max(1, Number(next?.next_value) || 1),
    dashboard: getD1Dashboard(sessions),
  };
}
