# PR #18 — real overlay OCR fix

Date: 2026-07-06

## Root causes confirmed on the originals

- The black detector measured darkness across the entire search area. White glyph rows split the dark run, so its ROI started inside the coordinate line and its right edge stopped inside the panel.
- There was no gray-caption detector. `1000081829.jpg` could only succeed later through an expensive general bottom-image OCR attempt, which is unreliable within the Android time budget.
- Compact decimal-comma text such as `64,60271,30,61999` was normalized ambiguously, and the third altitude/accuracy number did not produce a strong early-exit candidate.
- Overlay debug data existed, but the detector identity was not explicit in each rendered attempt.

## Fix

- Added explicit `black_bottom_right_overlay` and `gray_bottom_caption_overlay` detectors.
- Black detection finds the bottom/right dark panel first, then derives the padded top line, exact top line and left-before-accuracy crops.
- Gray detection finds the caption's top/bottom edges and left edge, then derives the bottom numeric line, second line and right numeric-line crops.
- Overlay crops use PSM 7 and whitelist `0123456789., NSEWnsew+-±mм`.
- Coordinate normalization repairs internal OCR spacing such as `30,59 1954E` only before a direction token.
- Compact decimal-comma pairs retain the separator: `64,60271,30,61999,238,5м` becomes `64.60271, 30.61999, 238.5м`.
- A Karelia-like first/second pair with a third number creates a high-confidence `karelia_pair_with_ignored_extra` candidate; the third value is ignored.
- Card details now render detector name, found state, exact crop bounds, source/processed previews, raw/normalized OCR, candidates and rejection reason.

## Real-original QA

Pixel 7 Chromium profile, production Vite build, real Tesseract:

| Source | Detector / crop | Raw OCR | Result |
| --- | --- | --- | --- |
| `1000081818.jpg` | `black_bottom_right_overlay`, ROI `661,1169,299,111`; crop `655,1163,305,59` | `64,604344N 30,591954E +3,48m` | `64.604344, 30.591954`, confident, one attempt |
| `1000081829.jpg` | `gray_bottom_caption_overlay`, ROI `421,1177,520,77`; accepted crop `418,1208,526,49` | `64,60271,30,61999, 238,5m` | `64.60271, 30.61999`, confident; `238.5` ignored |

Both photos are non-missing and enter distance calculation. Debug previews and raw OCR are visible in the card UI. Evidence: `13-real-overlay-originals-debug.png`.

## Regression coverage

- Parser cases cover directional comma/dot forms, compact `N/E`, contextual `M/£`, internal digit spacing and the gray-caption three-number format.
- Two committed fixtures retain the real lower 35% while replacing the rest of each scene with a neutral background.
- `npm run test:overlay-fixtures` verifies both detectors, PSM 7 overlay attempts, raw normalized coordinate text and final confident coordinates with real Tesseract.
- `npm test`, `npm run build`, `npx wrangler deploy --dry-run --config wrangler.toml` and `npm run test:browser-audit` passed.

## Manual Android QA on the updated preview

- [ ] `1000081818.jpg` returns `64.604344, 30.591954`, not missing.
- [ ] `1000081829.jpg` returns `64.60271, 30.61999`, not missing; `238,5м` is ignored.
- [ ] Both detector names, raw OCR and both crop previews are visible under `?debug=1`.
- [ ] Cleanup/upload remain available after OCR.

Merge: not performed. Production deployment: not performed.
