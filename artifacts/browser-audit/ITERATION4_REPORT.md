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

Deployment: not performed. Push: not performed. Merge: not performed.
