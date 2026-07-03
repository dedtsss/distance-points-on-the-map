# GPS Checker Map Photo — Project Status

Last updated: 2026-07-03

## Current state

- React/Vite frontend is deployed through GitHub Pages.
- Upload proxy is the Cloudflare Worker `spring-mouse-8d81`.
- OCR-first GPS extraction, EXIF fallback, distance validation, and GPX/KML/CSV export are implemented.
- Originals are never uploaded. Every file is cleaned and checked for remaining GPS/EXIF metadata first.
- The old hosting selector, manual Ninjabox link parser, ImgBB, Allwebs, Catbox, UMBPhotos, and their API/secret plumbing have been removed.

## Final upload flow

The frontend cleans all selected photos and sends one multipart batch to the Worker:

```text
POST multipart/form-data
target=bundle
photoId=<frontend photo id>   # repeated
files=<cleaned image>         # repeated in the same order
```

Worker provider order:

1. `freeimage` — primary link for every photo.
2. `ninjabox` — secondary individual `/i/<id>` link for every photo; files are uploaded as one gallery batch.
3. `x0` — called only for photos where Freeimage or Ninjabox failed or timed out.

Normal result: two links per photo, Freeimage + Ninjabox. If one default provider fails, x0 replaces it. If both default providers fail, x0 can provide only one link and both failures remain visible in the response.

Normalized response shape:

```json
{
  "ok": true,
  "target": "bundle",
  "ninjaboxGalleryUrl": "https://ninjabox.org/...",
  "items": [
    {
      "photoId": "...",
      "ok": true,
      "links": [
        { "provider": "freeimage", "role": "primary", "url": "..." },
        { "provider": "ninjabox", "role": "secondary", "url": "..." }
      ],
      "providers": {
        "freeimage": { "ok": true },
        "ninjabox": { "ok": true },
        "x0": null
      }
    }
  ]
}
```

## Freeimage key handling

No personal key or secret is stored. The Worker reads the public key and endpoint from `https://freeimage.host/api`, caches them in the warm isolate for one hour, and refreshes/retries once when the API reports a key error.

## Verification

Verified locally:

```text
npm test
npm run build
npx wrangler deploy --dry-run --config wrangler.toml
```

Verified through a temporary real Cloudflare deployment:

- two-file `bundle`: HTTP 200;
- two Freeimage links: returned;
- one Ninjabox gallery and two individual links: returned;
- x0 was not called during the successful bundle;
- separate x0 target: HTTP 200 and a public URL returned.

Temporary deployment and credentials were deleted after the test.

## Required GitHub secret

- `CLOUDFLARE_API_TOKEN` — deploys the production Worker.

No image-host API secret is required.

`IMGBB_API_KEY` is no longer read by the application, Worker, or workflows. Do not delete it automatically: it can be removed manually from GitHub/Cloudflare only after the production Worker deployment and its `bundle` smoke-test complete successfully.

## Important files

- `workers/host-proxy/worker.js` — bundle orchestration and fallback policy.
- `workers/host-proxy/freeimage.js` — Freeimage public API adapter.
- `workers/host-proxy/ninjabox.js` — Ninjabox form discovery, batch upload, and gallery parsing.
- `workers/host-proxy/x0.js` — x0.at fallback adapter.
- `src/utils/uploadManager.js` — cleaning and frontend result mapping.
- `src/utils/uploadProxy.js` — one batch request to the Worker.
- `src/components/LinksBlock.jsx` — two per-photo links and fallback label.
- `scripts/test-worker-upload.mjs` — live Worker smoke test.
- `scripts/test-upload-routing.mjs` — parsers and fallback composition tests.
- `scripts/image-host-lab/DECISION.md` — provider decision and evidence.

## Remaining manual checks

- Complete the production Worker -> smoke-test -> GitHub Pages release chain.
- Test a real cleaned multi-photo batch from Android Chrome.
- Confirm that Ninjabox keeps source order for the real-photo batch.
- Confirm UI behavior when one provider is intentionally unavailable and x0 is used.
