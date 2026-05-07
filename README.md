# GPS Photo Distance Checker

Browser-based React + Vite web app for checking distances between GPS-tagged photos and uploading cleaned image copies to a single selected image hosting provider.

## Features

- Select multiple JPG/JPEG photos, with simple PNG/WebP preview support where the browser allows it.
- Read EXIF GPS coordinates locally in the browser with `exifr`.
- Exclude photos without GPS from distance calculations.
- Calculate every GPS-photo pair with the Haversine formula.
- Flag pairs closer than a configurable threshold, defaulting to 25 meters.
- Highlight problem photo cards and recommend a photo to remove with a simple greedy conflict-count rule.
- Choose one image host per session: Catbox or ImgBB.
- Upload sequentially with fail-fast behavior and a 12-second timeout per file.
- Clean metadata before upload by redrawing each image on a canvas, preserving common EXIF orientation values and using a random filename.

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Notes and limitations

- The app has no backend, database, authentication, maps, history, or user accounts.
- EXIF reading and metadata cleaning happen locally in the browser.
- Canvas export creates a new JPEG copy without EXIF/GPS/device/timestamp metadata, but browser image decoding can vary on mobile devices and very large images may hit memory limits.
- Cross-origin upload availability depends on Catbox and ImgBB service health and CORS behavior.
