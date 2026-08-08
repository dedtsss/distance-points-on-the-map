-- Prepared, non-destructive D1 schema. It is intentionally not bound in
-- wrangler.toml until a Cloudflare D1 database is provisioned for this account.
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
  updated_at TEXT NOT NULL
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
  FOREIGN KEY (session_id) REFERENCES crm_sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_crm_sessions_updated_at ON crm_sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_photo_items_session_ordinal ON crm_photo_items(session_id, ordinal);
CREATE INDEX IF NOT EXISTS idx_crm_photo_items_work_status ON crm_photo_items(work_status);
