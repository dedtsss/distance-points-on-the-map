import { readPhotoExif } from './utils/exifReader.js';
import { readCoordinatesWithOcr } from './features/gps/ocrReader.js';
import { normalizeCoordinates } from './features/gps/coordinateParser.js';

// Keep the original File in browser memory only. The return value contains no binary data.
export async function readPhoto(file, options = {}) {
  const readExif = options.readExif || readPhotoExif;
  const readOcr = options.readOcr || readCoordinatesWithOcr;
  let exif;
  let ocr;
  const errors = [];
  try { exif = await readExif(file); } catch (error) { errors.push(`EXIF: ${error.message}`); }
  try { ocr = await readOcr(file, { onProgress: options.onProgress }); } catch (error) { errors.push(`OCR: ${error.message}`); }

  const exifCoordinates = normalizeCoordinates(exif?.coordinates?.latitude, exif?.coordinates?.longitude);
  const ocrCoordinates = ocr?.ok ? normalizeCoordinates(ocr.latitude, ocr.longitude) : null;
  const coordinates = exifCoordinates || ocrCoordinates;
  const source = exifCoordinates ? 'exif' : ocrCoordinates ? 'ocr' : 'missing';
  const coordinateQuality = source === 'exif' ? 'confident'
    : ocr?.coordinateQuality === 'low_precision' ? 'low_precision'
      : ocr?.ocrStatus === 'confident' && Number(ocr.confidence) >= 0.68 ? 'confident'
        : coordinates ? 'suspicious' : 'missing';
  return {
    indexFromOcr: ocr?.indexFromOcr || null,
    indexStatus: ocr?.indexStatus || 'missing',
    coordinates,
    gpsSource: source,
    gpsStatus: coordinates ? 'done' : 'missing',
    gpsConfidence: source === 'exif' ? 1 : Number(ocr?.confidence) || 0,
    gpsWarnings: ocr?.warnings || [],
    coordinateQuality,
    orientation: exif?.orientation || 1,
    ocrStatus: ocr?.ocrStatus || 'missing',
    warnings: [...(ocr?.warnings || []), ...errors],
  };
}
