import { readPhotoExif } from './utils/exifReader.js';
import { readCoordinatesWithOcr } from './features/gps/ocrReader.js';
import { normalizeCoordinates } from './features/gps/coordinateParser.js';
import { captureTime, availableOcrAccuracy } from './captureTime.js';

// Keep the original File in browser memory only. The return value contains no binary data.
export async function readPhoto(file, options = {}) {
  const indexMode = options.indexMode !== false;
  const readExif = options.readExif || readPhotoExif;
  const readOcr = options.readOcr || readCoordinatesWithOcr;
  let exif;
  let ocr;
  const errors = [];
  const ocrStarted = performance.now();
  try { exif = await readExif(file); } catch (error) { errors.push(`EXIF: ${error.message}`); }
  const exifCoordinates = normalizeCoordinates(exif?.coordinates?.latitude, exif?.coordinates?.longitude);
  if (indexMode || !exifCoordinates) {
    try { ocr = await readOcr(file, { onProgress: options.onProgress, indexMode, skipIndexOcr: !indexMode }); }
    catch (error) { errors.push(`OCR: ${error.message}`); }
  }
  const warnings = (ocr?.warnings || []).filter((warning) => indexMode || !/^index_/.test(warning));
  const ocrCoordinates = ocr?.ok ? normalizeCoordinates(ocr.latitude, ocr.longitude) : null;
  const coordinates = exifCoordinates || ocrCoordinates;
  const source = exifCoordinates ? 'exif' : ocrCoordinates ? 'ocr' : 'missing';
  const coordinateQuality = source === 'exif' ? 'confident'
    : ocr?.coordinateQuality === 'low_precision' ? 'low_precision'
      : ocr?.ocrStatus === 'confident' && Number(ocr.confidence) >= 0.68 ? 'confident'
        : coordinates ? 'suspicious' : 'missing';
  return {
    ...captureTime(file, exif),
    accuracyMeters: availableOcrAccuracy(ocr),
    indexMode,
    indexFromOcr: indexMode ? ocr?.indexFromOcr || null : null,
    indexStatus: indexMode ? ocr?.indexStatus || 'missing' : 'disabled',
    coordinates,
    gpsSource: source,
    gpsStatus: coordinates ? 'done' : 'missing',
    gpsConfidence: source === 'exif' ? 1 : Number(ocr?.confidence) || 0,
    gpsWarnings: exifCoordinates ? [] : warnings,
    coordinateQuality,
    orientation: exif?.orientation || 1,
    ocrStatus: ocr?.ocrStatus || 'missing',
    warnings: [...warnings, ...errors],
    ocrEngine: ocr ? ocr.ocrEngine || 'tesseract_web' : 'skipped',
    recognitionMs: ocr?.recognitionMs ?? Math.round(performance.now() - ocrStarted),
  };
}
