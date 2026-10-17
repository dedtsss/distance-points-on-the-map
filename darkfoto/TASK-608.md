# DarkCat Photo 0.5.3 — Issue #608 evidence

Contract: [agent-dispatch#608](https://github.com/dedtsss/agent-dispatch/issues/608), read in full, including the visual destination picker. Work continues on `manual/darkfoto-mvp-550` / [PR #52](https://github.com/dedtsss/distance-points-on-the-map/pull/52), from released/tested baseline `da7f9e3fdf044c8ccdb2ea1dc4c8d07bdccc5c2c`. Target: **0.5.3 / versionCode 18**, unchanged application ID `app.darkfoto.mvp`, signer pin and updater lineage.

## Implemented behavior

- Android reuses the existing native recovery manifest and app-private photo copies. A serialized writer coalesces mutations for 300 ms, includes newly selected photo copies, and flushes on background/page hide. Selection and field-only work are recoverable as well as reviewing/processed jobs. Web keeps its existing memory-only lifecycle.
- Cold launch validates the complete manifest and reads every private photo before installing the job. It restores saved logical rows directly: membership, moves, split/merge, removed placeholders/excluded members and removal undo, manual representative, manual status overrides, four metadata fields, index mode, publisher/onion, current/stale links, publication retry state and top-level tab. It rebuilds previews and derives distance/status annotations; it invokes neither OCR nor `groupPhotos`.
- Corrupt manifests, missing/unreadable private photos and failed saves report clear errors. Failed recovery retains the manifest and prevents processing/replacement until explicit reset. Failed reset retains the working UI. Reset cancels pending snapshots, drains an in-flight save, then clears native recovery before clearing the UI; MRUs and source originals survive. Native clear now shares the save executor and reports deletion failures.
- Initial confident no-index EXIF grouping searches the whole batch and joins one unambiguous nearest compatible group. The tight **3 m** anchor/representative bounds prevent bridge stretching; capture time does not split trusted same-location evidence. Deterministic input order/point numbering and stricter indexed/OCR safeguards remain. Later status analysis never regroups owner edits.
- Point actions **«В основные» / «В резерв» / «Авто»** store durable overrides independently of the representative. Forced Reserve remains Reserve; Auto neighbors yield to forced Main; forced-Main hard conflicts retain both owner choices and show measured distance/neighbor warnings. Overrides survive representative/membership changes and recovery.
- Nominal distance remains **25 m**, with fixed accepted tolerance **2 m**: **<23 m** is hard conflict, **23–<25 m** remains Main with yellow measured-distance/neighbor warnings, **>=25 m** is compliant. OCR/altitude/accuracy do not enlarge the tolerance. Sub-micrometre numerical noise is removed only for exact boundary comparison. Map status remains Main for tolerance-only pairs.
- Index-off TXT/copy identity is **«№N»**; indexed **«#NNNN»** stays unchanged. Card/map/GPX labels retain readable «Точка N».
- One visual destination picker supports a photo move and **«Объединить с…»** for any other active point, including distant and published points. It retains source previews, search, status sections, coordinates, photo counts and up to four destination thumbnails. Local previews decode lazily to bounded 160 px thumbnails; no native full-photo bridge reread is added. Landscape puts destination previews beside their details. A merge retains destination identity/override, a surviving manual representative, excluded-member undo and unique ownership. Both inputs' old publication URLs become stale and stay out of current output.
- Canonical Russian changelog and package/build metadata now describe 0.5.3/code18. No backend, dependency, credential, signer, application ID or deployment/access change was added.

## Focused synthetic regressions

`tests/workflow-reliability.test.mjs` adds **12 tests**: A1/B1/A2 and repeated non-contiguous exact coordinates with days between captures; deterministic ordering; nearby distinct points; anchor/representative bridge protection and ambiguous nearest matches; **22.9/23.0/24.0/25.0 m** boundaries independent of arbitrary accuracy/altitude; Main/Reserve/Auto and forced-Main conflicts; representative independence; status recalculation preserving manual split/move/merge; exact recovery with removed/excluded/moved members, overrides and stale links; distant published merge ownership/undo/invalidation; serialized save/reset order; TXT labels.

`tests/browser-recovery.mjs` replaces only the native plugin boundary. Production recovery wrappers/validation/writer, EXIF reader, grouping, private-photo fetches, UI and real MapLibre execute unchanged. Six canvas-generated JPEGs with synthetic EXIF produce four logical points. Selection reload and edited-job reload observe **zero OCR/readPhoto and groupPhotos calls**; initial recognition observes six reads and one grouping pass. Exact row equality is checked after representative/exclusion edits and after visual move/distant merge. Further checks cover fields, both index modes, reviewing/processed phases, current/stale links, publisher/onion/retry/tab, manual conflict/tolerance warnings, save/reset failures, corrupt manifests/missing copies, MRUs and source preservation.

The existing indexed browser membership/publication suite now also checks thumbnail/status/coordinate/count rendering, late-to-early photo movement, distant whole-point merge after publication and affected-link invalidation. Existing 0.5.2 no-index, EXIF/OCR, representative, map, export, privacy and updater regressions remain in the full suite.

All new media, coordinates and screenshots are synthetic. The deleted private sample archive was not used or required. Existing anonymized OCR regression fixtures remain unchanged.

## Local verification

Commands run from `darkfoto/`, except Gradle from `darkfoto/android/`:

- `node --test tests/workflow-reliability.test.mjs` — PASS, **12/12** focused tests.
- `npm test` — PASS, **77/77 unit tests**, web OCR, existing anonymized real-JPEG OCR, web lifecycle/MRU/reset, native-boundary recovery/failure checks, no-index real-EXIF/OCR browser checks, indexed membership/publication/retry, gallery/local export/About, TXT/GPX/copy, deterministic real MapLibre WebGL and launcher/splash checks.
- Mobile Chromium **320×812, 375×812, 812×320, 812×375** — PASS, recovery cards and visual move/merge picker; no horizontal overflow. Source and destination thumbnail rendering is asserted. Screenshots were visually inspected; picker surfaces are opaque and landscape keeps usable destination space.
- `npm run android:sync` — PASS, including the required `npm run build` and Capacitor sync. Vite reports its existing large-chunk advisory.
- `ANDROID_HOME=/home/codex/Android/Sdk ./gradlew :app:testDebugUnitTest :app:assembleDebug :app:assembleDebugAndroidTest --console=plain` — PASS, **9 native unit tests**, debug application APK and app instrumentation APK compilation. APK metadata confirms 0.5.3/code18/`app.darkfoto.mvp`.
- `git diff --check` — PASS.

## Browser evidence

Only canvas-generated photos and synthetic EXIF appear in these captures. External map tiles are stubbed for deterministic acceptance; this is not live provider verification.

- [Recovered job, 320×812](docs/task-608-evidence/recovery-320-812.png)
- [Recovered job, 375×812](docs/task-608-evidence/recovery-375-812.png)
- [Manual forced-Main conflict](docs/task-608-evidence/manual-conflict.png)
- [Visual picker, 320×812](docs/task-608-evidence/picker-320-812.png)
- [Visual picker, 375×812](docs/task-608-evidence/picker-375-812.png)
- [Visual picker, 812×320](docs/task-608-evidence/picker-812-320.png)
- [Visual picker, 812×375](docs/task-608-evidence/picker-812-375.png)

## Remaining device checks and stop boundary

No Android device was attached (`adb devices` empty); instrumentation APK compilation is not device execution. Actual Android force-stop/process eviction/recreation, app-data clear, private-file storage failure, SAF providers/cancellation, real camera EXIF/orientation, ML Kit latency, WebView GPU/gestures, OEM clipboard/share and installer handoff remain device/field checks. Browser reload verifies the production recovery logic against a simulated native storage boundary; it does not claim an actual OS process-death run. Live map/provider and live publication checks were not rerun.

Delivery stops at the tested pushed implementation head with PR #52 / Issue #608 evidence updated. Exact SHA and changed-file list are recorded there to avoid a self-referential hash in this document. Final exact-head Web/Android CI and automatic Bruce host release remain with the control plane. No merge, release signing, publication or deployment was performed.
