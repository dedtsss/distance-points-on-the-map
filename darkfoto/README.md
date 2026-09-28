# DarkFoto MVP

Standalone Android-first photo batch app. Run `npm ci`, `npm test`, and `npm run android:sync`; build the debug APK with `cd android && ./gradlew assembleDebug`. The PR workflow runs these steps and uploads the APK artifact. `npm run dev` serves a browser version for local checks.

Select individual photos or an Android folder. The folder bridge reads direct image children through Android's document picker. Processing stays in the WebView: EXIF GPS takes priority, bounded bottom-stamp OCR supplies the visible index and fallback coordinates, and the donor exact conflict-cover logic divides valid points into Main and Reserve at 25 m. Suspicious or missing coordinates are shown for review and are excluded from distance conflicts. TXT blocks retain the donor field order.

Enter a 56-character `.onion` service address to publish. Only sanitized JPEG copies are sent; the original names and original files stay local. The address is kept in memory for the current run. Tor/Orbot routing must already work on Android; a failed route fails the upload. The Android WebView has cleartext enabled for HTTP Onion Services, while the publisher validates the destination before any request.

The bundled OCR worker, WASM, and English model allow local OCR without a CDN. The model comes from [tesseract-ocr/tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast/blob/main/eng.traineddata). The original donor CRM is neither imported nor modified at runtime. Physical Android checks remain necessary for folder selection, OCR on real device photos, EXIF orientation, and Orbot routing.
