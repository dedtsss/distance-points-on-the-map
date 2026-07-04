import { normalizeCoordinates } from './coordinateParser.js';
import { readCoordinatesFromExif } from './exifFallback.js';
import { readCoordinatesWithOcr } from './ocrReader.js';

const debugOcr = (ocr) => ({
  rawText: ocr?.rawText || '',
  normalizedText: ocr?.normalizedText || '',
  confidence: ocr?.confidence || 0,
  candidates: ocr?.candidates || [],
  chosenCandidate: ocr?.chosenCandidate || null,
  attempts: ocr?.attempts || [],
  cropPreview: ocr?.cropPreview || '',
  processedPreview: ocr?.processedPreview || '',
  warnings: ocr?.warnings || [],
});

export async function readGpsPipeline(stableFile, options = {}) {
  const readOcr = options.dependencies?.readOcr || readCoordinatesWithOcr;
  const readExif = options.dependencies?.readExif || readCoordinatesFromExif;
  let ocr = null;
  let ocrError = null;
  let exifError = null;

  try {
    ocr = await readOcr(stableFile, {
      debug: options.debug === true,
      onProgress: options.onProgress,
    });
  } catch (error) {
    ocrError = error instanceof Error ? error.message : String(error);
  }

  const ocrCoordinates = normalizeCoordinates(ocr?.latitude, ocr?.longitude);
  if (ocr?.ok && ocrCoordinates) {
    let orientationExif = null;
    try {
      orientationExif = await readExif(stableFile);
    } catch (error) {
      exifError = error instanceof Error ? error.message : String(error);
    }
    return {
      found: true,
      coordinates: ocrCoordinates,
      source: 'ocr',
      orientation: orientationExif?.orientation || 1,
      debug: { ocr: debugOcr(ocr), ocrError, exif: orientationExif, exifError },
    };
  }

  let exif = null;
  try {
    exif = await readExif(stableFile);
  } catch (error) {
    exifError = error instanceof Error ? error.message : String(error);
  }

  const exifCoordinates = normalizeCoordinates(
    exif?.coordinates?.latitude,
    exif?.coordinates?.longitude,
  );
  if (exifCoordinates) {
    return {
      found: true,
      coordinates: exifCoordinates,
      source: 'exif',
      orientation: exif?.orientation || 1,
      debug: { ocr: debugOcr(ocr), ocrError, exif, exifError },
    };
  }

  return {
    found: false,
    coordinates: null,
    source: null,
    orientation: exif?.orientation || 1,
    debug: {
      ocr: debugOcr(ocr),
      ocrError,
      exif,
      exifError: exifError || exif?.exifError || null,
    },
  };
}
