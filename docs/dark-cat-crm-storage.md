# Dark Cat CRM storage

## Runtime backend

The shipped browser runtime uses the `localStorage` session repository under
`dark-cat-crm-sessions-v1`. It stores serializable session and photo metadata,
small local thumbnails when browser quota permits, links and diagnostics; it
never stores source files, cleaned blobs, object URLs or raw OCR debug data.

`gps-checker-last-session-v1` remains a compatibility snapshot. Opening it
migrates the snapshot into the multi-session repository without deleting other
sessions.

## D1 hand-off

`migrations/0001_dark_cat_crm_sessions.sql` is an idempotent, non-destructive
schema for `crm_sessions` and `crm_photo_items`. The frontend D1 boundary lives
in `src/features/session/d1SessionAdapter.js`; the prepared Worker mapper is
`workers/host-proxy/d1SessionRepository.js`. The adapter throws a clear
unavailable error until an authenticated Worker API is provisioned; it never
reports a fake remote save.

D1 deliberately receives metadata, links and (only if available later) an
external thumbnail reference. Browser `data:` previews and source/cleaned photo
payloads are never written to D1.

At implementation time the local environment had neither
`CLOUDFLARE_API_TOKEN` nor `CLOUDFLARE_ACCOUNT_ID`; `wrangler d1 list` could
not authenticate. No guessed D1 database id or binding has been committed.
Once credentials are available, provision a D1 database, add its binding to
both Worker configs, apply the migration, and expose authenticated `/api/sessions`
endpoints backed by the prepared adapter.
