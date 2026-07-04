# Browser audit — GPS Checker Map Photo

Date: 2026-07-04

## Scope

Production build served locally through Vite Preview. Primary browser profile: Playwright Chromium using the Pixel 7 Android Chrome device profile. A 1280×900 desktop viewport was checked separately.

To reproduce locally, build and start Vite Preview on port 4173, install the Chromium runtime with `npx playwright install chromium`, then run `npm run test:browser-audit`. The browser audit performs real Freeimage/Ninjabox uploads in its normal-flow scenario.

Test batch:

1. JPEG with a high-contrast GPS overlay for real Tesseract OCR.
2. JPEG with real EXIF GPS coordinates and no GPS overlay.
3. JPEG without coordinates.

The normal-flow test used the published Worker and real Freeimage/Ninjabox uploads. Fallback and cleanup failures used deterministic intercepted Worker responses so provider outages were not required.

## Flow evidence

### Step 1 — Start screen

Screenshot: `01-start-mobile.png`

Health: pass.

- The primary action and privacy explanation are immediately visible.
- No debug controls are visible without `?debug=1`.
- No horizontal overflow at the Pixel 7 viewport.

### Step 2 — Three files selected and buffered

Screenshot: `02-selected-mobile.png`

Health: pass.

- All filenames and sizes are visible in source order.
- The single processing action becomes available.
- Cards show a neutral pre-processing state without technical warnings.

### Step 3 — OCR processing

Screenshot: `03-processing-mobile.png`

Health: pass after fix.

- The action is disabled and clearly shows that processing is active.
- Stage counters remain visible.
- The current photo shows a concise OCR status.

### Step 4 — OCR, EXIF, missing GPS, cleanup and real upload results

Screenshot: `04-results-mobile.png`

Health: pass after fixes.

- OCR result: `62.223456, 34.223456`.
- EXIF fallback result: `62.123456, 34.123456`.
- The third photo correctly reports no coordinates and does not participate in distance calculation.
- All three photos received Freeimage and Ninjabox links.
- “Copy all links” copied at least six URLs.
- Downloading the uploaded cleaned EXIF test photo and checking it again returned `hasGps: false`, `hasExif: false`, and no remaining metadata keys.

### Step 5 — Debug query mode

Screenshot: `05-debug-mobile.png`

Health: pass.

- The diagnostic banner and “Подробнее” controls exist only with `?debug=1`.
- Raw OCR output was `LAT 62.223456 / LON 34.223456`.
- Provider responses and cleanup verification are retained in the collapsed details.

### Step 6 — Desktop responsive layout

Screenshot: `06-start-desktop.png`

Health: pass.

- Content remains centered and readable.
- No horizontal overflow.
- The main action remains prominent without stretching the layout excessively.

### Step 7 — x0.at fallback presentation

Screenshot: `07-fallback-mobile.png`

Health: pass.

- A simulated Freeimage failure produced Ninjabox + x0.at links.
- The warning is short and identifies the replaced provider.
- The results table puts x0.at in the fallback column.

### Step 8 — Cleanup failure isolation

Screenshot: `08-cleanup-isolation-mobile.png`

Health: pass.

- A corrupt JPEG was not uploaded and showed the required short cleanup error.
- A valid second photo continued through cleanup and upload.
- Only one Worker request was made, containing the successfully cleaned photo.

## Defects found and fixed

1. Successful OCR results were discarded by a temporal-dead-zone error while reading EXIF orientation/debug data. The variable is now initialized before the OCR success branch, with a regression test.
2. Photos without coordinates were incorrectly counted as distance conflicts in the summary. Conflict counting now includes only `too_close` results.
3. Keyboard focus was not visibly emphasized. Buttons, links, disclosure controls and the file picker now receive a high-contrast focus outline.

## Console and network

- Console errors: 0.
- Uncaught page errors: 0.
- Failed requests: 0.
- Horizontal overflow: none on tested mobile and desktop viewports.

## Accessibility observations

Confirmed in this run:

- File input is reachable by keyboard and has a visible focus treatment.
- Main buttons meet the intended large mobile target size.
- Headings, lists, table structure, labels and live result region are present.
- Text reflows without horizontal page scrolling.

Limits:

- This is not a full WCAG conformance test.
- Screen-reader announcements, Android TalkBack, browser zoom above 100%, real touch behavior, low-memory device behavior and the physical Android file picker were not available in Playwright.
- Real x0.at activation was not forced; its frontend result handling was tested with a deterministic Worker response, while the Worker fallback policy remains covered by unit tests.

## Result

The tested browser flow is healthy after the three fixes above. The remaining validation requirement is a short run on a physical Android Chrome device with real camera files.
