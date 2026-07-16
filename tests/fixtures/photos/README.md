# Real Photo Fixtures

The committed regression fixtures retain only the lower 35% of the two approved source photos; the rest is replaced with a neutral background so detector geometry stays identical without storing the full scene:

- `black-bottom-right-overlay-crop.jpg` — black panel with directional coordinates in the top line;
- `gray-bottom-caption-overlay-crop.jpg` — translucent gray caption with coordinates in the second line.

Run their detector and real Tesseract regression with:

```bash
npm run test:overlay-fixtures
```

Do not commit additional private production photos unless that is intentional.

Suggested local flow:

1. Copy real photos into this folder.
2. Run the app with `npm run dev`.
3. Open the app with debug mode:

```text
http://localhost:5173/distance-points-on-the-map/?debug=1
```

4. Upload the photos through the file picker.
5. Open each card and inspect:
   - OCR crop;
   - processed OCR crop;
   - raw OCR text;
   - parser candidates;
   - chosen candidate;
   - warnings;
   - final source: `ocr`, `exif`, `manual`, or `missing`.

Expected behavior:

- photos without usable coordinates show `нет координат`;
- missing photos do not participate in distance calculations;
- `0,0` placeholders are rejected unless explicitly confirmed in future UI;
- upload errors are shown per photo card.
