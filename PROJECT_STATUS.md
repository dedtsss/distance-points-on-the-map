# GPS Checker Map Photo — Project Status

Last updated: 2026-07-04

## Current algorithm

The application has one automatic flow:

1. Copy every picker `File` immediately into a stable in-memory `ArrayBuffer`/`Blob`/`File`.
2. Create a lightweight thumbnail with a maximum side of 320 px.
3. Read coordinates through a sequential, memory-bounded multi-pass OCR session, then use EXIF as fallback.
4. Calculate distances only for photos with usable coordinates.
5. Clean metadata independently for every photo.
6. Upload only successfully cleaned copies through the Cloudflare Worker.
7. Keep links, statuses, coordinates and thumbnails; release full buffers after successful upload.

The order is always the browser `FileList` order. `number = index + 1`. Cleaned names are `gps-001.jpg`, `gps-002.jpg`, and so on. `photoId` is the authoritative result key.

## Upload blocking rules

Does not block upload:

- missing coordinates;
- OCR not finding coordinates;
- EXIF not finding coordinates;
- a distance below 25 m;
- one or several close-pair warnings.

Blocks upload for the affected photo:

- the stable file copy could not be created;
- metadata cleanup failed;
- metadata verification after cleanup was not safe;
- the upload layer received the original instead of a cleaned copy;
- Worker/providers returned no links.

A failure for one photo does not stop the rest of the batch.

## Cleanup policy

JPEG is always processed with binary metadata stripping first, including JPEG files with EXIF orientation. This avoids decoding large Android camera images solely because orientation is not `1`.

Canvas fallback is used only when:

- the source is not JPEG;
- binary JPEG parsing failed;
- binary output failed metadata verification.

Canvas output is resized before drawing so its longest side is at most 2800 px. Cleanup debug records source/output dimensions, resize scale, orientation, chosen path, binary result, Canvas result and verification. Normal UI shows only the controlled cleanup error.

Original files are never uploaded.

## Provider selection policy

Defaults remain backward compatible:

- Freeimage: enabled;
- Ninjabox: enabled;
- mandatory x0.at third link: disabled;
- x0.at fallback: enabled.

Frontend sends optional multipart fields:

```text
providers=freeimage,ninjabox
includeX0=false
fallback=x0
```

If these fields are absent, Worker uses the original Freeimage + Ninjabox + conditional x0 policy. At least one primary provider must be selected. Ninjabox remains a batch upload and can return a common gallery.

## Result matching and link format

Worker results are matched by `photoId`. An index or filename mismatch is retained as warning/debug but does not discard valid links.

The “All links” field contains URLs only. URLs for each photo are consecutive, followed by one blank line before the next photo. A fallback x0 URL occupies the failed provider position. Mandatory x0 adds a third URL for every photo.

## Session storage

The latest result is stored under:

```text
gps-checker-last-session-v1
```

Stored data includes session timestamps, threshold, provider settings, filenames, lightweight thumbnails, coordinates, distance/cleanup/upload statuses and public result links.

Never stored:

- `File` or `Blob`;
- source/stable/cleaned buffers;
- object URLs;
- full debug or raw image data.

On reload the user may restore or delete the saved result. “Clear result” removes both current UI state and the stored session.

The snapshot is refreshed after meaningful photo-state updates, not only after the final batch result. Restored sessions contain display-only data: cleanup/upload cannot resume without selecting the source files again. OCR confidence/status and manual-coordinate flags are preserved.

## OCR policy

OCR uses one Tesseract worker per photo and evaluates memory-safe candidates sequentially. The candidate list covers bottom 35%, bottom-right 45%, bottom-center 60%, then the full image only as fallback. Resized original, grayscale/contrast, threshold and inverted-threshold treatments are used without parallel image decoding. A strong parsed result exits early; otherwise the best candidate is selected using parser confidence, Tesseract confidence, directional/label context and OCR correction count.

The coordinate parser accepts decimal, LAT/LON, cardinal-direction, degrees/decimal-minutes and degrees/minutes/seconds formats. Common character corrections are applied only inside numeric-looking tokens. Cards show OCR quality and allow manual latitude/longitude correction; applying a correction recalculates all distance results without selecting photos again.

Parsed values are not automatically trusted. Batch sanity validation builds a median cluster from the current selection and marks distant outliers as `suspicious`; an optional Karelia filter is available. Only `confident` and manually confirmed coordinates participate in distance calculations. OCR, cleanup and upload can be run as separate stages, and the collapsed processing journal exposes the active step and elapsed time.

## Preview policy

Cards use a JPEG thumbnail with a maximum side of 320 px. Thumbnail generation is sequential to avoid concurrent full-image decodes on Android. Full stable and cleaned buffers are released after upload; the small thumbnail remains for the result UI and may be stored in the session. If thumbnail creation fails, the card shows a simple fallback state.

## Worker and hosting

- Worker: `spring-mouse-8d81`
- Freeimage and Ninjabox are the supported primary providers.
- x0.at is optional mandatory output or fallback.
- ImgBB, Allwebs, Catbox and UMBPhotos are not part of the application.
- No manual Ninjabox parser or cleaned-file download mode exists.

## Verification commands

```bash
npm test
npm run build
npx wrangler deploy --dry-run --config wrangler.toml
```

No deployment is performed without explicit user confirmation.
