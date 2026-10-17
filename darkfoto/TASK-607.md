# DarkCat Photo 0.5.2 — Issue #607 evidence

Contract: [agent-dispatch#607](https://github.com/dedtsss/agent-dispatch/issues/607), read in full. Work continues only on `manual/darkfoto-mvp-550` / [PR #52](https://github.com/dedtsss/distance-points-on-the-map/pull/52). The clean initial HEAD was verified as `3a9b1c8756cd99be66b78dc7d9ce5b601df8c9f1` before source changes. Target: **0.5.2 / versionCode 17**, unchanged application ID `app.darkfoto.mvp`, signer pin and updater lineage.

## Implemented behavior

- `Учитывать номер/индекс на фото` is an explicit workflow switch, OFF on fresh launch, reset and reload. Recognition locks it for the current job; current work and the switch are never restored on cold launch. Indexed mode remains opt-in with genuine index review reasons.
- `readPhoto` validates EXIF before invoking either web or Android OCR. OFF + valid EXIF skips OCR entirely. Missing/invalid EXIF falls back to coordinate OCR; ON also reads indexes. EXIF coordinates, capture-time and orientation remain authoritative. OCR noise cannot downgrade valid EXIF GPS.
- Web fixed-overlay OCR skips its index pass when OFF; native OCR does not run extra passes solely to find an index when OFF. Decimal comma/dot coordinate pairs followed by altitude parse as coordinates, with no invented index or accuracy.
- No-index consecutive EXIF photos group only within the existing **3 m** tight radius, without a capture-time limit. OCR retains stricter timing/evidence requirements. The **25 m** business threshold remains unchanged and is used only for Main/Reserve analysis.
- Confident no-index points participate in Main/Reserve, conflicts, map status colors, TXT/copy, aggregate and single-point GPX, and local session status export. Labels use `Точка N`; missing index alone emits no review reason or TXT error.
- Each thumbnail has its own filename, authoritative coordinates, EXIF/OCR source and optional index. The aggregate filename list is removed. Display formatting suppresses EXIF rational floating-point tails; stored coordinates are unchanged.
- `Сделать главной` visibly selects a member as representative. The same point state drives header, map, conflicts, TXT, GPX and local export. Selection survives edits/append/moves of other members. Removal/move of the selected member restores the normal deterministic accuracy/valid-coordinate/order rule. Split/merge preserve a surviving manual choice without duplicating ownership. Affected publications are invalidated through the existing membership path.
- Existing reset/MRU, indexed recognition, membership, gallery/swipe/zoom, publication/retry, metadata stripping, export and updater paths remain covered by their regressions. No service, account, storage backend, dependency or runtime access was added.

## Synthetic regression and privacy

`tests/fixtures/no-index-18.mjs` contains **18 synthetic photos → exactly 9 points**, with member counts **3, 2, 1, 2, 3, 1, 2, 2, 2**. Same-point captures are three minutes apart; one distinct pair is about **8.9 m** apart and stays separate. Analysis yields **8 Main / 1 Reserve / 0 Review**.

`tests/fixtures/synthetic-exif.mjs` generates an EXIF envelope in memory around a browser-created canvas JPEG. Browser acceptance uses the production EXIF reader on all 18 JPEGs and observes **zero OCR calls**. The second member differs by about 1 m, proving per-photo evidence and representative changes. Two additional canvas JPEGs without EXIF exercise real bundled Tesseract on decimal-comma and decimal-dot coordinate stamps followed by `225.0m` altitude. Native stamp parsing separately checks the anonymized Cyrillic grammar from the Issue.

All new fixture names, coordinates, times, JPEGs and screenshots are synthetic. No owner photos, private sample coordinates, raw device metadata or private archives were read, copied or committed for this change. Original media and raw metadata remain local; publication still sends only verified sanitized copies through the existing routes.

## Local verification

Commands run from `darkfoto/`, except Gradle commands run from `darkfoto/android/`:

- `node --test tests/no-index.test.mjs` — PASS, **5** focused tests covering EXIF precedence/skip, comma/dot + altitude, 18→9 grouping and nearby separation, OCR safeguards, all representative consumers and ownership/fallback.
- `npm test` — PASS, **65** unit tests plus web OCR, existing real-JPEG OCR, lifecycle/reset/MRU, new no-index browser acceptance, indexed membership/publication/retry, TXT/GPX/copy, gallery/local export/About, deterministic real MapLibre WebGL and launcher/splash checks.
- Mobile Chromium viewports **320×812, 375×812, 812×320, 812×375** — no horizontal overflow; per-thumbnail evidence/actions fit. No-index map has nine markers with one Reserve marker and follows the selected representative. External basemap is replaced only for deterministic browser acceptance; the production map engine and worker run unchanged.
- Playwright CLI independently checked that enabling the switch then reloading returns it to OFF.
- `npm run android:sync` — PASS, including `npm run build` and Capacitor sync.
- `ANDROID_HOME=/home/codex/Android/Sdk ./gradlew :app:testDebugUnitTest :app:assembleDebug :app:assembleDebugAndroidTest --console=plain` — PASS; **9 native unit tests**, debug application APK and app instrumentation APK compile. Instrumentation was **not executed on a device/emulator**.
- `git diff --check` — PASS.

An exploratory unqualified Gradle `testDebugUnitTest assembleDebug assembleDebugAndroidTest` also selected the auxiliary `capacitor-cordova-android-plugins` instrumentation APK and failed on duplicate Kotlin stdlib classes (1.8.22 vs jdk7/jdk8 1.6.21). The existing CI uses the explicit `:app:` tasks above, which pass. No unrelated plugin/dependency changes were made. The first attempt with the non-writable system SDK could not provision build tools; the writable user SDK was used for the successful app build.

## Browser evidence

All captures use canvas-generated media and synthetic EXIF. The map capture uses a deterministic background, not live provider tile evidence.

- [Per-thumbnail evidence and chosen main photo, 320 px](docs/task-607-evidence/points-320-812.png)
- [Per-thumbnail evidence and chosen main photo, 375 px](docs/task-607-evidence/points-375-812.png)
- [Landscape, 812×375](docs/task-607-evidence/points-812-375.png)
- [Nine-point map / representative, 375 px](docs/task-607-evidence/map-375.png)

## Remaining device checks and delivery boundary

Physical Android follow-up remains: real camera EXIF/orientation, native ML Kit fallback and latency on actual devices, WebView GPU/gestures/orientation, SAF folder providers/cancel/no-space, OEM clipboard/share and updater installer. Browser mobile viewports and compiled instrumentation do not claim device execution. A new live-provider network check is not claimed; existing deterministic map failure/timeout/retry checks pass.

Worker delivery ends at the tested pushed implementation head with PR #52 and Issue #607 updated. Final exact-head Web/Android CI lifecycle and the automatic Bruce host release remain with the control plane. No merge, release signing, publication or deployment was performed by this worker. The final commit SHA and exact changed-file manifest are recorded in the PR/Issue ledger, avoiding a self-referential commit hash here.
