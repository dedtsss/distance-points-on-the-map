# DarkFoto 0.2.0 OCR decision

## 0.3.0 superseding implementation

The owner's 0.2.0 field report measured 60–90 seconds per photo and observed visible 6300/6301/6302 results incorrectly sent to review. That physical result supersedes the 0.2.0 Tesseract-only decision described below. The 0.3.0 Android path decodes the selected JPEG natively, respects EXIF orientation, selects the black right stamp or gray full-width caption, and scales that crop to 960 px wide. Bundled offline ML Kit Latin runs one pass; one alternate profile is allowed when parsing is incomplete. Tesseract runs only on the prepared crop with a four-second deadline. Native passes are limited to 5.5 and 2.5 seconds at the bridge. Per-photo recognition time and engine are recorded in the test result and debug console. These bounds prevent a silent minute-long OCR pass, but the 5 s cold, 3 s warmed p95 and 25 s/10 photo goals still require the owner's physical Android measurement.

`tests/fixtures/golden.json` defines the full-JPEG corpus. The three 630x JPEGs retain the redacted real scene and stamp geometry, with only the stamp text replaced to reproduce the field indexes and coordinates; the owner's original failing JPEGs were unavailable. The Android instrumentation harness uses the native picker cache, native bounded crop, ML Kit, shared JavaScript parser, eligibility and conflict split. It asserts 6301 alone => 1/0/0; 6300/6301/6302 at the same coordinates => 1/2/0; and all five corpus photos => 2/2/1. The gray caption remains review because its index is absent. Browser tests additionally reject date/time and coordinate fragments as indexes. The Android TXT instrumentation test writes UTF-8 Cyrillic text and reads it back through the same FileProvider URI used by the share sheet.

## Corpus and measured result

The committed JPEGs in `tests/fixtures/` come from the repository's approved real-photo diagnostics. Each is a complete 960 × 1280 JPEG whose upper scene was replaced with a neutral field; the original bottom stamp and detector geometry remain. The black stamp visibly contains point index `5939`, `64.604344 N`, `30.591954 E`. The gray caption contains `64.60271`, `30.61999` and altitude, but no four-digit point index. The separate synthetic browser cases cover leading zero `0123`, shifted black overlay and a gray overlay with an index.

| Route | Black coordinates | Black index | Gray coordinates | Gray index |
| --- | --- | --- | --- | --- |
| Donor main Tesseract fixture regression | correct | not asserted | correct | not asserted |
| DarkFoto Tesseract 5.1.1, full JPEG → decode → crop → OCR | correct | `5939` | correct | missing, correctly |
| Bundled ML Kit Latin 16.0.1, Android bitmap → enlarged stamp crop → OCR | text contains both | text contains `5939` | text contains both | absent, correctly |

DarkFoto's three-photo sequential browser corpus and Android emulator test both resolved two copies of the black JPEG into one Main and one Reserve at the 25 m rule, while the gray JPEG remained in Needs review / Error. The emulator test exercised the actual native cache file, Capacitor local URL, WebView image decode, local OCR and split. Its three instrumentation tests passed in 25.751 seconds on the local API 35 emulator. The Android ML Kit crop calls took 4.758 seconds for black and 3.991 seconds for gray in that run. These timings include different work and should not be used as a direct engine speed ratio.

The browser regression also suppresses the first fixed-overlay index recognition attempt on the `0123` JPEG. Bounded later attempts still recover the exact leading-zero index.

The debug APK was about 12 MB before adding the bundled ML Kit test dependency and 56 MB with it, with all test architectures included. [Google's Android documentation](https://developers.google.com/ml-kit/vision/text-recognition/v2/android) distinguishes the bundled offline model from the dynamically downloaded Play Services model and estimates about 4 MB per script per architecture. Only the debug APK contains ML Kit; the release APK retains Tesseract. The second engine produced no additional correct point on this corpus, so DarkFoto keeps the donor Tesseract pipeline: overlay detection, dedicated coordinate/index crops, multiple preprocessing and PSM attempts, and deterministic candidate scoring.

The corpus is bounded. It does not include the owner's exact failing 0.1.2 photos, so physical Android selection and decode still need a field check. The native-to-WebView emulator test directly covers the failure class seen on 0.1.2.
