# Iteration 3 — OCR reliability and session restore

Date: 2026-07-04

Environment: local production Vite build, Playwright Chromium with Pixel 7 profile. Deployment was not performed. Public Worker and Pages were not changed.

## What changed

1. Removed the accidental single-attempt limit. OCR now uses one Tesseract worker per photo and a sequential, memory-bounded candidate queue.
2. Added bottom 35%, bottom-right 45%, bottom-center 60% and full-image fallback ROIs. Candidate treatments cover resized original, grayscale/contrast, threshold and inverted threshold.
3. Added early exit for strong results, a 75-second per-photo budget and best-attempt scoring based on parser confidence, OCR confidence, directional/label context and correction count.
4. Expanded decimal, LAT/LON, N/E/S/W, degrees/decimal-minutes and degrees/minutes/seconds parsing. O/0, I/l/|/1, S/5 and B/8 corrections are limited to numeric-looking tokens.
5. Cards now distinguish confident, uncertain, missing and suspicious OCR results. Manual latitude/longitude correction recalculates all distances without reselecting files.
6. `gps-checker-last-session-v1` is refreshed during meaningful photo updates. It persists photoId, thumbnail, coordinates, OCR quality, manual flag, distance/cleanup/upload statuses, links, settings and user messages.
7. Session serialization excludes File, Blob, ArrayBuffer, source/cleaned buffers, object URLs and full debug. A restored lightweight session is explicitly view-only until source files are selected again.

## Verification

- `npm test`: passed.
- `npm run build`: passed.
- `npx wrangler deploy --dry-run --config wrangler.toml`: passed.
- Pixel 7 Playwright browser QA: passed, including pre-completion persistence, manual correction, reload, restore and all-links output.
- Five supplied JPEGs: all five reached intercepted upload after safe cleanup. Photos 1–3 were confident on attempt 1; photo 4 was confident on attempt 7; photo 5 was recovered as `64.602720, 30.620000` with uncertain quality on attempt 7. No public upload was made.

Evidence:

- `11-iteration3-results.png`
- `12-iteration3-session-restored.png`

## Remaining risk

Pixel 7 emulation cannot reproduce the Android file-provider lifecycle, device memory pressure or camera/gallery picker behavior exactly. The original failing workflow still needs verification on physical Android Chrome. OCR can remain slow for low-contrast photos because candidates run sequentially; the explicit quality state and manual correction prevent silent acceptance.

## Manual Android checklist

- [ ] Process 10 photos in one batch.
- [ ] Process the two originally problematic photos.
- [ ] Process the two problematic photos plus a third photo without reload.
- [ ] Reload after successful upload and restore links, coordinates and statuses.
- [ ] Reload after OCR or cleanup failure and verify the saved partial result.
- [ ] Manually correct latitude/longitude and verify distance recalculation.
- [ ] Restore a session and verify the common all-links block.
- [ ] Confirm that restored lightweight state requires reselecting files before a new cleanup/upload.

Deployment: not performed.

## PR #18 review follow-up

The forced `maxAttempts: 1` override was removed. OCR now executes the memory-bounded ROI/preprocessing sequence with one reusable worker until a strong result, the candidate list, or the per-photo time budget is exhausted.

Parsed numeric ranges are no longer sufficient for a trusted result. Photos now carry `coordinateQuality` (`confident`, `suspicious`, `missing`, `manual`), and batch median sanity validation rejects distant outliers such as `30.591181, 164.604670`. Swapped coordinates are suggested but never applied silently. Suspicious points are excluded from both the confident summary and distance calculations.

Session snapshots are saved incrementally after meaningful state changes and exclude File, Blob, ArrayBuffer, object URLs and debug. OCR-only, cleanup-only, upload-cleaned and full actions are available independently. The processing journal, elapsed timer and build/version block expose the active operation and exact local build.

Browser QA verifies thumbnail creation, provider settings, staged actions, session reload/restore, preview fallback, shared all-links output and journal events. The five supplied JPEGs passed the staged flow; photos 1–4 were confident and photo 5 was correctly retained as suspicious pending manual review.

Deployment: not performed. Merge: not performed.
