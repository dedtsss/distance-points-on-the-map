// Prepared Worker-side D1 repository. It is intentionally not imported by the
// live upload Worker until a DARK_CAT_DB binding and authenticated session API
// are provisioned.

const json = (value) => JSON.stringify(value ?? null);
const parseJson = (value, fallback) => {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
};

const photoRow = (session, photo, now) => [
  photo.photoId || photo.id,
  session.sessionId,
  Number(photo.number) || 0,
  photo.fileName || '',
  photo.processedFileName || '',
  photo.indexFromOcr || null,
  photo.coordinates?.latitude ?? null,
  photo.coordinates?.longitude ?? null,
  photo.gpsSource || 'unavailable',
  photo.ocrStatus || 'idle',
  photo.cleanupStatus || 'idle',
  photo.uploadStatus || 'idle',
  json(photo.uploadResult?.links || []),
  photo.workStatus === 'reserve' || photo.disposition === 'reserve' ? 'reserve' : 'active',
  photo.reserveReason || null,
  // D1 stores only a future external reference, never a browser data URL or
  // another encoded photo payload.
  String(photo.thumbnailReference || '').startsWith('http') ? photo.thumbnailReference : null,
  json({ coordinateQuality: photo.coordinateQuality || 'missing', userError: photo.userError || '' }),
  now,
  now,
];

export async function upsertD1Session(db, session) {
  if (!db?.prepare) throw new Error('D1 binding DARK_CAT_DB is unavailable.');
  const now = new Date().toISOString();
  const settings = {
    providerSettings: session.providerSettings || {},
    regionMode: session.regionMode || 'auto',
    mapLayerId: session.mapLayerId || '',
    copiedPhotoIds: session.copiedPhotoIds || [],
  };
  const statements = [
    db.prepare(`INSERT INTO crm_sessions (
      session_id, session_number, title, color, packing, description, status, stage,
      threshold_meters, settings_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      title = excluded.title, color = excluded.color, packing = excluded.packing,
      description = excluded.description, status = excluded.status, stage = excluded.stage,
      threshold_meters = excluded.threshold_meters, settings_json = excluded.settings_json,
      updated_at = excluded.updated_at`).bind(
      session.sessionId, Number(session.sessionNumber) || 0, session.title || session.name || '',
      session.color || '', session.packing || '', session.description || '', session.status || 'draft',
      session.stage || 'processing', Number(session.thresholdMeters) || 25, json(settings),
      session.createdAt || now, now,
    ),
    db.prepare('DELETE FROM crm_photo_items WHERE session_id = ?').bind(session.sessionId),
  ];
  (session.photos || []).forEach((photo) => {
    statements.push(db.prepare(`INSERT INTO crm_photo_items (
      photo_id, session_id, ordinal, original_file_name, processed_file_name, ocr_index,
      latitude, longitude, coordinate_source, ocr_status, cleanup_status, upload_status,
      links_json, work_status, reserve_reason, thumbnail_reference, diagnostics_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(...photoRow(session, photo, now)));
  });
  await db.batch(statements);
  return { sessionId: session.sessionId, updatedAt: now };
}

export async function listD1Sessions(db) {
  if (!db?.prepare) throw new Error('D1 binding DARK_CAT_DB is unavailable.');
  const sessions = (await db.prepare('SELECT * FROM crm_sessions ORDER BY updated_at DESC').all()).results || [];
  const photos = (await db.prepare('SELECT * FROM crm_photo_items ORDER BY session_id, ordinal').all()).results || [];
  const photosBySession = new Map();
  photos.forEach((row) => {
    const entry = {
      photoId: row.photo_id,
      number: row.ordinal,
      fileName: row.original_file_name,
      processedFileName: row.processed_file_name || '',
      indexFromOcr: row.ocr_index || null,
      coordinates: row.latitude === null || row.longitude === null ? null : { latitude: row.latitude, longitude: row.longitude },
      gpsSource: row.coordinate_source,
      ocrStatus: row.ocr_status,
      cleanupStatus: row.cleanup_status,
      uploadStatus: row.upload_status,
      uploadResult: { links: parseJson(row.links_json, []) },
      workStatus: row.work_status,
      disposition: row.work_status,
      reserveReason: row.reserve_reason || '',
      thumbnailReference: row.thumbnail_reference || null,
      ...parseJson(row.diagnostics_json, {}),
    };
    photosBySession.set(row.session_id, [...(photosBySession.get(row.session_id) || []), entry]);
  });
  return sessions.map((row) => {
    const settings = parseJson(row.settings_json, {});
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
      photos: photosBySession.get(row.session_id) || [],
    };
  });
}
