-- Non-destructive D1 schema for the shared owner/guest Dark Cat CRM database.
-- The migration contains no binary photo payloads. It is safe to apply more
-- than once because every object creation is guarded with IF NOT EXISTS.
CREATE TABLE IF NOT EXISTS crm_sessions (
  session_id TEXT PRIMARY KEY,
  session_number INTEGER NOT NULL UNIQUE,
  title TEXT,
  color TEXT,
  packing TEXT,
  description TEXT,
  status TEXT NOT NULL,
  stage TEXT NOT NULL,
  threshold_meters REAL NOT NULL DEFAULT 25,
  settings_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (session_number > 0),
  CHECK (length(session_id) BETWEEN 1 AND 120)
);

CREATE TABLE IF NOT EXISTS crm_photo_items (
  photo_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  original_file_name TEXT,
  processed_file_name TEXT,
  ocr_index TEXT,
  latitude REAL,
  longitude REAL,
  coordinate_source TEXT NOT NULL DEFAULT 'unavailable',
  ocr_status TEXT,
  cleanup_status TEXT,
  upload_status TEXT,
  links_json TEXT,
  work_status TEXT NOT NULL DEFAULT 'active',
  reserve_reason TEXT,
  thumbnail_reference TEXT,
  diagnostics_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (ordinal > 0),
  CHECK (work_status IN ('active', 'reserve')),
  FOREIGN KEY (session_id) REFERENCES crm_sessions(session_id) ON DELETE CASCADE
);

-- A single-row SQLite sequence is used by the Worker for server-side session
-- number allocation. The UPDATE ... RETURNING operation is serialized by D1;
-- clients never calculate max(session_number) + 1.
CREATE TABLE IF NOT EXISTS crm_sequences (
  sequence_name TEXT PRIMARY KEY,
  next_value INTEGER NOT NULL,
  CHECK (next_value > 0)
);

INSERT OR IGNORE INTO crm_sequences (sequence_name, next_value)
VALUES ('sessions', COALESCE((SELECT MAX(session_number) + 1 FROM crm_sessions), 1));

CREATE INDEX IF NOT EXISTS idx_crm_sessions_updated_at ON crm_sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_photo_items_session_ordinal ON crm_photo_items(session_id, ordinal);
CREATE INDEX IF NOT EXISTS idx_crm_photo_items_work_status ON crm_photo_items(work_status);
CREATE INDEX IF NOT EXISTS idx_crm_sessions_session_number ON crm_sessions(session_number);
