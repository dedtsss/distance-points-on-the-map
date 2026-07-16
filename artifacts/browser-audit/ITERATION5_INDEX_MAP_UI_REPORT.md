# Iteration 5: Index, Map, UI

Date: 2026-07-16

## Index OCR

- Added first-class photo index state: `indexFromOcr`, `indexStatus`, `pointLabel`, `internalName`, `displayName`, `displayFileName`.
- Supported strong index labels:
  - `Номер индекса: 5939`
  - `Индекс: 5939`
  - `Index: 5939`
  - `IDX 5939`
  - `№5939`
  - `#5939`
- Weak/fallback OCR matches after coordinates are preserved as `indexStatus: "uncertain"` so the UI asks for review.
- Manual index edits set `indexStatus: "manual"`.
- Missing index sets `indexStatus: "missing"` and does not block OCR, cleanup, upload, or link generation.

## Internal Names

- With index: `internalName = "index-5939"`, `displayFileName = "index-5939.jpg"`.
- Without index: `internalName = "photo-001-no-index"`, `displayFileName = "photo-001-no-index.jpg"`.
- `pointLabel` uses the index when available, otherwise `Фото N`.
- These names are internal UI/session/map/export names only.

## Privacy / Upload

- Provider upload filenames remain generic: `gps-001.jpg`, `gps-002.jpg`, etc.
- The provider request sends `photoId` and cleaned `File` objects only; it does not send `internalName`, `displayName`, `displayFileName`, or index metadata.
- Upload mapping remains keyed by `photoId`.
- Added tests that verify index `5939` appears in UI/internal state but not in outbound provider filenames or form fields.

## Map

- Added separate `Карта` screen.
- Uses Leaflet with dynamic JS import and Vite CSS bundling.
- Auto-fits all valid coordinates.
- Shows markers and permanent labels from `indexFromOcr` or fallback `Фото N`.
- Marker popup includes index, internal display filename, coordinates, `coordinateQuality`, `distanceStatus`, and uploaded links.
- Draws strict distance lines only between `confident` / `manual` points.
- Highlights distance conflicts under the configured threshold in red.
- Shows `low_precision` and `suspicious` points with separate marker styles but excludes them from strict OK lines.
- Shows lists for found points, missing coordinates, low precision, suspicious, and conflicts.
- Empty state: `Нет точек для отображения. Сначала распознай координаты.`

## UI

- Added Material 3-like app shell:
  - top app bar;
  - desktop navigation rail;
  - mobile bottom navigation;
  - surface/container tokens;
  - rounded cards;
  - status chips;
  - metric cards;
  - section headers;
  - empty states.
- Added screens:
  - `Загрузка и проверка`;
  - `Карта`;
  - `Результаты`;
  - `Настройки`.
- Added compact results table with photo number, index, coordinates, quality, distance status, upload status, links count, and actions.
- Settings now contain provider toggles, threshold meters, region mode, debug status, and privacy placeholder.

## Session Restore

- Session snapshot now persists:
  - index fields and derived names;
  - coordinates and coordinate quality;
  - distance status;
  - upload links;
  - thumbnails;
  - active screen;
  - threshold meters.
- Session still excludes `File`, `Blob`, `ArrayBuffer`, object URLs, debug payloads, and raw photo data.
- Restored sessions keep map labels and result table index state.

## Verification

- `npm test` passed.
- `npm run build:cloudflare` passed.
- `npm run build:github-pages` passed.
- `npx wrangler deploy --dry-run --config wrangler.toml` passed.
- Browser sanity check passed on local Vite server:
  - map empty state;
  - restored map with markers;
  - results table;
  - mobile map layout without page horizontal overflow.

## Bundle

- Cloudflare build output:
  - CSS: about 35.23 kB raw / 10.74 kB gzip.
  - Leaflet chunk: about 149.98 kB raw / 43.55 kB gzip.
  - Main JS: about 326.37 kB raw / 106.78 kB gzip.

## Screenshots

- `artifacts/browser-audit/iteration5-empty-map-desktop.png`
- `artifacts/browser-audit/iteration5-map-desktop.png`
- `artifacts/browser-audit/iteration5-results-desktop.png`
- `artifacts/browser-audit/iteration5-map-mobile.png`

## Deployment

- Production deploy was not performed.
- Production Worker is unchanged.
