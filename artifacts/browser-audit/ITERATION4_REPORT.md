# Iteration 4 — trustworthy coordinates and observable stages

Date: 2026-07-05

Deployment, push and merge were not performed.

## Root cause

The previous pipeline treated any parser pair inside the global latitude/longitude ranges as usable. It had no batch-level outlier check, so plausible numbers such as `30.591181, 164.604670` could reach distance calculation and receive `OK`. The old summary counted completed GPS attempts rather than trustworthy coordinates.

## Changes

- Added batch median/outlier sanity validation and optional Karelia region filtering.
- Added explicit `confident`, `suspicious`, `missing` and `manual` coordinate quality states. Suspicious points never enter distance calculation.
- Split actions into OCR-only, cleanup-only, upload-cleaned and full processing.
- Added manual coordinate editor and explicit lat/lon swap action.
- Replaced the progress counters with selected files, OCR attempts, confident/suspicious/missing/manual coordinates, cleaned/uploaded photos and cleanup/upload errors.
- Kept provider settings and thumbnails visible throughout the local flow and restored sessions.
- Added incremental lightweight session diagnostics and a visible processing journal with elapsed time.
- Added a build/version panel with branch, commit, timestamp and feature flags.
- Kept one shared all-links formatter for textarea and clipboard with one blank line between photo groups.

## Local QA checklist

The staged OCR-only → cleanup-only → upload-cleaned flow passed with all five supplied JPEGs. Photos 1–4 were classified confident; photo 5 (`64.602720, 30.620000`) was correctly classified suspicious and excluded from trustworthy-coordinate counts while cleanup/upload continued.

- Build/version block visible.
- Provider settings visible after file selection and restore.
- Preview or explicit fallback visible in every card.
- OCR-only does not clean or upload.
- Suspicious coordinates do not show distance `OK`.
- Manual correction recalculates distances.
- Cleanup-only preserves cleaned blobs for the separate upload action.
- Upload-cleaned rejects absence of cleaned copies.
- Reload offers restore and restores cards, previews, coordinates, statuses, links and providers.
- Journal records selection, OCR, sanity rejection, cleanup, provider upload and session events.
- All-links groups contain exactly one blank line.

## Low precision coordinates

Added a separate `low_precision` coordinate quality for valid region-like pairs where latitude or longitude has only 0-2 decimal places. These coordinates are stored on the photo state, shown as found coordinates, and counted separately from confident, suspicious and missing coordinates.

Checked parser strings:

- `64,60272, 30,62, 237,9м` → `64.60272, 30.62`, extra `237.9` ignored, `low_precision_coordinate`.
- `64,60272, 30,62, 238,0м` → `64.60272, 30.62`, extra `238.0` ignored, `low_precision_coordinate`.
- `Меф/1гр/синяя упак/прикоп-заброс 64,60272, 30,62, 238,0м` → `64.60272, 30.62`, extra ignored, `low_precision_coordinate`.
- `64,60272, 30,62000, 238,0м` → `64.60272, 30.62`, source precision `30.62000` preserved and not marked low precision.

Implementation notes:

- OCR exits early when a parsed valid pair has only the `low_precision_coordinate` warning, so the later heavy bottom/full-image passes are not run only to chase confidence.
- The processing journal reports `Координаты найдены с низкой точностью: 64.60272, 30.62`.
- Low precision coordinates get `distanceStatus: low_precision` and do not receive strict 25 m `OK` until the user confirms coordinates manually.
- Manual confirmation converts the photo to `coordinateQuality: manual` and recalculates distances.
- Session restore preserves coordinates, `gpsStatus`, `ocrStatus`, `coordinateQuality: low_precision`, precision metadata, warnings, thumbnail and upload links without storing files/blob/object URLs/debug.
- UI copy is separate: `Координаты найдены, но точность низкая — проверь вручную`; it does not reuse missing or generic suspicious text.

Tests passed:

- `npm test`
- `npm run build`
- `npx wrangler deploy --dry-run --config wrangler.toml`
- Browser QA on local preview with synthetic `1000081817/1000081816`-style JPEG overlays for OCR-only, cleanup/upload, restore and manual confirmation. The real `1000081817.jpg` and `1000081816.jpg` files were not present in the local workspace.
- Browser QA on the two attached real JPEGs:
  - `Photo 1.jpg` recognized as `64.604670, 30.591181`, `coordinateQuality: confident`, `gpsStatus: done`, `ocrStatus: confident`, 2 OCR attempts.
  - `Photo 2.jpg` recognized as `64.60272, 30.62`, `coordinateQuality: low_precision`, `gpsStatus: low_precision`, `ocrStatus: low_precision`, `distanceStatus: low_precision`, precision `{ latitude: 5, longitude: 2 }`.
  - The second photo stopped after `gray_bottom_caption_overlay:bottom_numeric_line`; no `bottom_35`, `bottom_right_45` or `bottom_center_60` OCR passes ran.
  - Cleanup/upload continued with cleaned filenames `gps-001.jpg` and `gps-002.jpg`; restore preserved `low_precision`; manual confirmation recalculated distance and allowed `OK`.

Deployment: not performed. Merge: not performed. Production Worker and GitHub Pages: unchanged.
