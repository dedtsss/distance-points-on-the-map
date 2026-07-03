# Final Image Hosts Integration Smoke Test

Date: 2026-07-03T05:26:58+03:00
Commit base: 60234b0 (working tree implementation tested before commit)
Runtime: temporary Cloudflare Workers deployment, deleted after verification

## Bundle result

- Input: 2 synthetic PNG files, 1024x768.
- Worker HTTP: 200.
- Duration: 2429 ms.
- Complete photos: 2/2.
- Freeimage links: 2/2.
- Ninjabox individual links: 2/2.
- Ninjabox common gallery: returned.
- x0 fallback calls: 0, as both default providers succeeded.

## x0 fallback adapter

- Separate target HTTP: 200.
- Duration: 194 ms.
- Public direct URL: returned.

## Conclusion

PASS. The production Worker code returns two default links per photo and keeps x0 unused during a fully successful bundle. Fallback composition for primary-provider failures is covered by `scripts/test-upload-routing.mjs`.
