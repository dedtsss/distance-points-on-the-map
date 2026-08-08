# Dark Cat CRM storage

## Runtime model

Version 1.1.0 is server-first. The authenticated Worker exposes:

- `GET /api/sessions` and `GET /api/sessions/:id`;
- `PUT /api/sessions/:id` for idempotent create/update;
- `DELETE /api/sessions/:id`;
- `GET /api/dashboard`.

The owner and guest hostnames use the existing Worker authentication boundary.
They are intended to point to the same D1 binding, `DB`, so both contexts see
one logical CRM history.

The Worker stores session/photo metadata, coordinates, OCR state, ACTIVE/RESERVE
state, links and settings, including processing flags (`metadataCleanup`,
`renameFiles`, `metadataFirst`). It never stores source files, cleaned blobs, browser
data URLs or raw OCR debug payloads. Photo data is sanitized before D1 writes.

Session numbers are allocated by the `crm_sequences` singleton row and an
atomic `UPDATE ... RETURNING`; the browser never allocates from `max()+1`.

## localStorage migration and fallback

`dark-cat-crm-sessions-v1` and the legacy `gps-checker-last-session-v1` remain
migration sources and local backups. On successful server hydration, missing local session IDs are shown in an explicit
“Перенести в облако” prompt. Import uses the stable session ID, is retry-safe,
and marks `dark-cat-d1-local-migration-v1` only after every upload succeeds.
The local copy is intentionally retained during the transition.

If the server cannot be reached, the UI labels the local write `unsynced` and
does not claim server persistence. The local adapter remains useful for tests
and offline/read fallback; it is not authoritative in a ready production
session. Remote writes from one browser are serialized, and a successful server
number is copied back into the local backup so the fallback cannot silently
revert numbering.

## Schema and operations

`migrations/0001_dark_cat_crm_sessions.sql` is non-destructive and idempotent.
It creates `crm_sessions`, `crm_photo_items`, `crm_sequences`, foreign keys,
unique session numbers and the indexes used by the list/dashboard paths.
Apply it locally first with Wrangler, then remotely after the `DB` binding is
provisioned. Do not drop or reset an existing production database.

The repository mapper is `workers/host-proxy/d1SessionRepository.js`, the
frontend boundary is `src/features/session/d1SessionAdapter.js`, and the
import implementation is `src/features/session/sessionMigration.js`.

## Provisioning status

The production configs intentionally do not contain a guessed database ID.
The approved GitHub deployment credential currently deploys Workers but a D1
list request fails at `/accounts/<configured-account>/d1/database` with
Cloudflare authentication error code `10000`. The missing permission is
Account `D1: Edit` (including D1 read/list access) on the existing
`CLOUDFLARE_API_TOKEN` credential. Once granted, use the manual
`.github/workflows/provision-d1.yml`, record the returned database ID in both
Wrangler configs as the shared `DB` binding, then run
`.github/workflows/migrate-d1.yml`. That workflow exports a remote SQL backup
artifact before applying migration, verifies the schema, and then owner/guest
can be deployed.

No secret value belongs in this document, Wrangler config, commits, PRs or
issue comments.
