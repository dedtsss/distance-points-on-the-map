# GPS Checker Map Photo — Project Status

Last updated: 2026-06-03

## Repository

- GitHub: https://github.com/dedtsss/distance-points-on-the-map
- Main project folder: `GPS-Photo-Distance-Checker`
- Frontend: React + Vite
- Frontend deploy: GitHub Pages
- Upload proxy: Cloudflare Worker
- Worker name: `spring-mouse-8d81`
- Worker URL: https://spring-mouse-8d81.dvabobra2014.workers.dev/
- Cloudflare account id: `977cf45e04d4066ca0b8288de1a337ed`

## Current State

- OCR-first GPS extraction is implemented.
- EXIF is kept as fallback when OCR does not find valid coordinates.
- Photo cards store OCR status, raw OCR text, GPS source, coordinates, warnings, and manual edits.
- Distance calculation is implemented with Haversine.
- 25 meter violations are detected across all valid point pairs.
- GPX/KML/CSV export uses the normalized point model and valid final coordinates.
- Upload hosting has been switched from Allwebs to ImgBB through the Cloudflare Worker.
- The frontend does not use or store the ImgBB API key.
- Missing coordinates are represented as `latitude: null`, `longitude: null`, `coordinates: null`, `gpsSource: "missing"`, `gpsStatus: "missing"`.
- Missing/invalid/placeholder `0,0` points do not participate in distance calculations or main exports.
- OCR parser exposes candidates, chosen candidate, warnings, confidence, and debug crop/preprocess previews when `?debug=1` is enabled.
- Upload records per-photo failures instead of stopping silently at the first failed photo.

## Upload Flow

Frontend uploads cleaned images to the Worker:

```text
POST multipart/form-data
target=imgbb
file=<image>
```

The Worker reads `IMGBB_API_KEY` from Cloudflare Worker secrets and sends the image to:

```text
https://api.imgbb.com/1/upload
```

Successful Worker response is normalized:

```json
{
  "ok": true,
  "target": "imgbb",
  "url": "...",
  "viewerUrl": "...",
  "displayUrl": "...",
  "deleteUrl": "...",
  "raw": {}
}
```

## Required Secrets

GitHub repository secrets:

- `CLOUDFLARE_API_TOKEN` — used by GitHub Actions to deploy the Cloudflare Worker and sync Worker secrets.
- `IMGBB_API_KEY` — used only by the sync workflow to install the Cloudflare Worker secret.

Cloudflare Worker secrets:

- `IMGBB_API_KEY` — required by the Worker for ImgBB uploads.

Do not put real API keys into source code, frontend env files, README, issues, or workflow logs.

## GitHub Actions Chain

The workflow chain is now automatic:

1. `Deploy Cloudflare Worker`
2. `Sync Worker Secrets`
3. `Test Worker Upload`

The chain is triggered by a push to `main` when Worker/config/workflow files change.

Latest verified commit:

```text
58fecce Chain worker secret sync after deploy
```

Verified workflow results:

- Deploy Cloudflare Worker: success
- Sync Worker Secrets: success
- Test Worker Upload: success
- Deploy to GitHub Pages: success

Verified local smoke-test:

```text
node scripts/test-worker-upload.mjs
```

Result:

```text
target=imgbb
HTTP 200
ok=true
public ImgBB URL returned
```

## Important Files

- `workers/host-proxy/worker.js` — Worker routing and upload target dispatch.
- `workers/host-proxy/imgbb.js` — ImgBB upload integration.
- `src/utils/uploadManager.js` — frontend upload orchestration through Worker proxy.
- `src/components/HostingSelector.jsx` — upload provider UI, ImgBB proxy is default.
- `src/utils/ocrGpsReader.js` — OCR crop/preprocess/parser pipeline.
- `src/utils/geoDistance.js` — pure distance and violation logic.
- `src/utils/geoExport.js` — GPX/KML/CSV export.
- `scripts/test-worker-upload.mjs` — Worker upload smoke-test.
- `.github/workflows/deploy-worker.yml` — deploys Worker.
- `.github/workflows/sync-worker-secrets.yml` — syncs `IMGBB_API_KEY` to Worker secret.
- `.github/workflows/test-worker-upload.yml` — verifies Worker upload.

## Useful Commands

```bash
npm test
npm run build
npx wrangler deploy --dry-run --config wrangler.toml
node scripts/test-worker-upload.mjs
```

## Notes For Future Codex/ChatGPT

- Business logic should not be changed when only checking secrets or deploy configuration.
- Upload must stay behind the Cloudflare Worker; do not call ImgBB directly from the frontend.
- Allwebs is legacy and should not be the default provider.
- OCR and distance logic are intentionally separate modules.
- If upload fails with `IMGBB_API_KEY is not configured in Cloudflare Worker secrets`, run or inspect `Sync Worker Secrets`.
- If a future assistant has GitHub connector access, it can inspect this file plus recent commits instead of requiring chat history.

## 2026-06-03 Stabilization Notes

Fixed real-photo MVP stability issues:

- `0,0`, empty strings, `null/null`, and `gpsSource: "missing"` are no longer usable coordinates.
- Distance calculations use only `hasUsableCoordinates()` / `getValidPointsForDistance()`.
- `markProblemPoints()` marks missing/invalid photos as `missing_coordinates` without creating false violations.
- GPX/KML/CSV export filters through the same usable-coordinate logic.
- OCR parser rejects `0,0`, one-coordinate results, and low-confidence parser results.
- OCR tries multiple bottom-right crop/preprocess variants before EXIF fallback.
- OCR also supports a real-photo gray/light overlay case with short Karelia-like coordinate precision, such as `64,60272, 30,62`.
- OCR index fallback avoids using unlabeled one/two-digit noise, all-zero OCR noise such as `000`, or altitude fragments as `indexFromOcr`.
- UI shows `нет координат` and `не участвует в расчёте` for missing points.
- Debug mode is available with `?debug=1`.

Verified checks:

```text
npm test: passed
npm run build: passed
npx wrangler deploy --dry-run --config wrangler.toml: passed
node scripts/test-worker-upload.mjs: passed, ImgBB target returned HTTP 200
```

Verified browser E2E with 5 real attached photos:

- OCR recognized 5/5 photo coordinate blocks.
- OCR indexes recognized: `5130`, `5285`, `5917`, `5291`, `5241`.
- Distance stats: 5 valid points, 0 missing points, 0 violations at 25 m.
- ImgBB upload through Worker succeeded for 5/5 cleaned images.

Real-photo fixture folder:

```text
tests/fixtures/photos/
```

Use that folder for local private photo checks. Do not commit private production photos unless intentional.
