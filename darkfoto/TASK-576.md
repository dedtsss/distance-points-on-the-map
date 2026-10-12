# DarkCat Photo 0.5.1 — Issue #576 evidence

Contract: [agent-dispatch#576](https://github.com/dedtsss/agent-dispatch/issues/576).
Continues `manual/darkfoto-mvp-550` and [PR #52](https://github.com/dedtsss/distance-points-on-the-map/pull/52), after released baseline `a712eb186ced39e1d97b033c56c91ca54f29fd9f`. Target: **0.5.1 / versionCode 16**, package `app.darkfoto.mvp`.

## Behavior

Each cold launch starts an empty job. The App never loads legacy Android recovery or persists a new active-job manifest. Legacy app-private recovery copies are discarded; source photos and the separate four local MRU stores are untouched. Pending publication can still be retried during the running job. Each field keeps ten distinct non-empty recent values across restarts; suggestions fill editable fields.

`Начать заново` beside the photo controls confirms when photos, points or meaningful field text exist. Cancel preserves the job. Confirm clears photos, points, fields, publication/retry/copy/progress state, previews, dialogs and map selection, clears browser file inputs, and scrolls to the empty job's beginning. Empty jobs reset without a prompt. Work/copy operations disable reset while running.

MapLibre uses OpenFreeMap Liberty without credentials. The ordinary status pill is 24px tall, 12px regular-weight text, a 1px border and a light shadow; the invisible touch area remains at least 44px. Main/Reserve/Review retain distinct colors and symbols, with a small outline for selection. Attribution wraps within a 6px bottom-left inset, retaining MapLibre/OpenFreeMap/OpenMapTiles/OpenStreetMap without duplicating the provider credit.

`На карте` sends a fresh request containing the logical ID, centers that ID at zoom 17, highlights it and opens its preview. Requests are consumed once so ordinary tab visits and membership edits preserve the viewport. The nearby chooser and `Открыть точку` retain exact coincident identities. Cards without coordinates disable the map action. Reset discards the map instance and selection.

Member filenames retain member order in a one-file-per-line list with long-token wrapping. Local session export appears once in the general copy/action block; its transaction, sanitized JPEG/TXT format and destination bridge remain unchanged.

About renders the latest three entries from the full repository changelog, with one useful item per category and a link to the complete history. Current version, update status/download/install controls remain. Full release notes are still extracted by `node scripts/release-notes.mjs 0.5.1`; older changelog entries are retained. The existing 0.5.0 entry now reflects its confirmed 11 October release.

## Focused and regression coverage

| Area | Check |
| --- | --- |
| Cold start / reset / MRU separation | `tests/browser-job.mjs`: old native recovery is never read; zero photos/points/fields/progress; four persistent 10-value MRUs; editable suggestions; cancel/confirm/field-only/empty reset; original File bytes remain readable |
| MRU limits and independence | `tests/recent-values.test.mjs`: distinct/non-empty values, ordering, restart, filtering and explicit per-value forget |
| Map and exact navigation | `tests/session-map.test.mjs`, `tests/browser-map.mjs`: live projection, status colors, marker dimensions/weight/touch target, initial focus/close zoom, coincident ID round trips, stable viewport, membership edits, exclusions/restore/append, reset, bounded failure/timeout/retry |
| Mobile layout / export / About | `tests/browser-stage-a.mjs`: vertical deterministic long filenames, three-column gallery/swipe/zoom/LIFO restore, single export action location, sanitized edited export and failure rollback, latest three compact entries |
| Versions / complete changelog | `tests/changelog-build.test.mjs`: 0.5.1/code16, unchanged package/name, all five full entries extractable, exactly three compact entries |
| Existing workflow regressions | Full `npm test`: 60 unit tests, OCR browser/real-JPEG fixtures, point membership, publication/retry, append, TXT/GPX/copy, gallery, local export and launcher assets |

Map, filenames/gallery and About checks cover **320×812, 375×812, 812×320 and 812×375**, asserting no horizontal overflow. Map assertions additionally verify attribution and marker bounds. The live map command requires successful production tile responses, not just a style HTTP response or fixture background.

## Delivery boundary and device follow-up

The worker delivers the tested pushed head and updates PR #52 / Issue #576; normal Web and Android CI links belong in that final ledger. Android CI verifies native unit tests, debug/instrumentation compilation and an unsigned release APK. Signing, merge and release publication belong to the control plane under the tested-build delivery rule.

Physical Android follow-up remains: real WebView GPU/pan/pinch/orientation and offline retry; force-stop/relaunch MRU behavior; SAF provider/cancel/no-space/rename; EXIF orientation on camera files; OEM clipboard/share/updater installer. Browser viewport results do not claim a physical-device or emulator runtime pass.

## Local verification

- `npm test` — PASS: all 60 unit tests plus OCR browser/real-JPEG, job lifecycle, membership/publication, gallery/export/About, deterministic MapLibre and launcher/splash checks.
- `node tests/browser-map.mjs` and `npm run test:map:live` — PASS after final attribution polish; **18 successful production tile responses**, real MapLibre/WebGL/worker, provider/source credits exactly once.
- `npm run android:sync` — PASS, includes `npm run build` and Capacitor Android sync. No signing or deployment is performed.
- `git diff --check` — PASS before the final commit.

The normal final-head Web/Android CI results and exact pushed SHA are recorded in PR #52 and the terminal Issue #576 ledger, avoiding a self-referential commit hash in this file.

## Committed browser evidence

All map captures below use the live Liberty provider, not the deterministic test background.

- [empty-320.png](docs/task-576-evidence/empty-320.png)
- [filenames-320.png](docs/task-576-evidence/filenames-320.png)
- [about-320.png](docs/task-576-evidence/about-320.png)
- [map-320-812.png](docs/task-576-evidence/map-320-812.png)
- [map-375-812.png](docs/task-576-evidence/map-375-812.png)
- [map-812-320.png](docs/task-576-evidence/map-812-320.png)
- [map-812-375.png](docs/task-576-evidence/map-812-375.png)
- [map-exact-coincident-8.png](docs/task-576-evidence/map-exact-coincident-8.png)
- [map-exact-coincident-point-1-2.png](docs/task-576-evidence/map-exact-coincident-point-1-2.png)
