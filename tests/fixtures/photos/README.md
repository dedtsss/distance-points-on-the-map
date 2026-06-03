# Real Photo Fixtures

Put 5 real GPS overlay photos here for local OCR/debug checks.

Do not commit private production photos unless you intentionally want them in the repository.

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
