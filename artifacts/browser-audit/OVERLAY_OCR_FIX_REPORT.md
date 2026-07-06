# PR #18 — overlay OCR crop/parser fix

Date: 2026-07-06

## Root cause

The overlay detector found the black panel, but immediately truncated it to one fixed-height crop. That mixed detection and line selection, so a real-device layout could cut glyph tops/bottoms or the right edge before preprocessing. Debug previews were stored as data URLs inside JSON, so the UI did not display the images needed to diagnose the crop.

## Fix

- Detection now keeps the complete overlay bounds and reuses them across line attempts.
- Overlay OCR tries a 6 px padded first line, slightly shifted crops, the top 40% of the panel and a left crop without the accuracy suffix.
- Preprocessing covers grayscale/contrast, inverted grayscale and thresholds 120/150/180 at memory-bounded 4x scale.
- Overlay attempts use Tesseract PSM 7 and the coordinate whitelist.
- The direct directional parser accepts comma/dot decimals, optional spaces, compact coordinates and an ignored accuracy suffix.
- Direction-only OCR corrections normalize `M` to `N` and `£` to `E` only inside a complete directional coordinate pair.
- `?debug=1` card details render ROI status, exact crop bounds, source and processed previews, raw/normalized OCR, parser candidates and rejection reason.

## Automated QA

- `npm test`: passed.
- `npm run build`: passed.
- `npx wrangler deploy --dry-run --config wrangler.toml`: passed.
- Pixel 7 Playwright QA with real Tesseract: passed on a generated JPEG containing `64,604344N 30,591954E +3,48m` in a bottom-right black overlay.
- The first accepted crop was `x: 381, y: 464, width: 525, height: 64`; its source and processed previews contain the complete coordinate line without the lower part of the panel.
- Parsed result: latitude `64.604344`, longitude `30.591954`, confident quality.
- Distance calculation, manual correction, cleanup and intercepted upload completed; upload was not blocked.

## Manual Android QA — `1000081818.jpg`

The original file is not present in this checkout or the available QA artifacts, so the following real-photo check remains explicit rather than being reported as passed:

- [ ] Overlay ROI is found.
- [ ] Source crop contains exactly `64,604344N 30,591954E ±3,48m`; no index, icons, lower row or excess black panel is present.
- [ ] Glyph tops/bottoms, `N`, `E` and the right edge are not clipped.
- [ ] Raw and normalized OCR are visible in card details.
- [ ] Parsed coordinates are `64.604344`, `30.591954` and quality is not `missing`.
- [ ] Distance participates after confident/manual confirmation.
- [ ] Cleanup and upload remain available and are not blocked.

Merge: not performed. Production deployment: not performed.
