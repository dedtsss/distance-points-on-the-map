import { recordOcrDiagnostic } from '../diagnostics/ocrDiagnostics.js';
import { normalizeCoordinates } from './coordinateParser.js';
import { readCoordinatesFromExif } from './exifFallback.js';
import { readCoordinatesWithOcr } from './ocrReader.js';

const debugOcr = (ocr, includeDetails = true) => ({
  rawText: ocr?.rawText || '',
  normalizedText: ocr?.normalizedText || '',
  indexFromOcr: ocr?.indexFromOcr || null,
  indexStatus: ocr?.indexStatus || (ocr?.indexFromOcr ? 'uncertain' : 'missing'),
  indexAttempts: includeDetails ? (ocr?.indexAttempts || []) : [],
  indexCandidates: ocr?.indexCandidates || [],
  chosenIndexCandidate: ocr?.chosenIndexCandidate || null,
  indexCropBounds: ocr?.indexCropBounds || null,
  indexOcrConfidence: ocr?.indexOcrConfidence || 0,
  confidence: ocr?.confidence || 0,
  ocrConfidence: ocr?.ocrConfidence || 0,
  ocrStatus: ocr?.ocrStatus || 'missing',
  candidates: ocr?.candidates || [],
  chosenCandidate: ocr?.chosenCandidate || null,
  attempts: includeDetails ? (ocr?.attempts || []) : [],
  cropPreview: ocr?.cropPreview || '',
  processedPreview: ocr?.processedPreview || '',
  warnings: ocr?.warnings || [],
});

export async function readGpsPipeline(stableFile, options = {}) {
  const readOcr = options.dependencies?.readOcr || readCoordinatesWithOcr;
  const readExif = options.dependencies?.readExif || readCoordinatesFromExif;
  const startedAt = Date.now();
  let ocr = null;
  let ocrError = null;
  let exifError = null;
  let exif = null;

  const finish = (result) => {
    try {
      recordOcrDiagnostic({
        stableFile,
        elapsedMs: Date.now() - startedAt,
        result,
      });
    } catch {
      // Diagnostic persistence is best-effort and must never break OCR or EXIF processing.
    }
    return result;
  };

  const readExifSafely = async () => {
    try {
      exif = await readExif(stableFile);
    } catch (error) {
      exifError = error instanceof Error ? error.message : String(error);
    }
  };

  // A real EXIF coordinate is authoritative. OCR still runs afterwards to
  // recover the point index and diagnostics, but can no longer overwrite it.
  if (options.metadataFirst !== false) await readExifSafely();

  try {
    ocr = await readOcr(stableFile, {
      debug: options.debug === true,
      onProgress: options.onProgress,
    });
  } catch (error) {
    ocrError = error instanceof Error ? error.message : String(error);
  }

  if (options.metadataFirst !== false) {
    const exifCoordinates = normalizeCoordinates(
      exif?.coordinates?.latitude,
      exif?.coordinates?.longitude,
    );
    if (exifCoordinates) {
      return finish({
        found: true,
        coordinates: exifCoordinates,
        source: 'exif',
        confidence: 1,
        ocrStatus: ocr?.ocrStatus || 'exif',
        indexFromOcr: ocr?.indexFromOcr || null,
        indexStatus: ocr?.indexStatus || (ocr?.indexFromOcr ? 'uncertain' : 'missing'),
        coordinateQuality: 'confident',
        coordinatePrecision: null,
        coordinateText: null,
        gpsWarnings: [],
        ocrAttemptCount: ocr?.attempts?.length || 0,
        orientation: exif?.orientation || 1,
        debug: { ocr: debugOcr(ocr, true), ocrError, exif, exifError },
      });
    }
  }

  const ocrCoordinates = normalizeCoordinates(ocr?.latitude, ocr?.longitude);
  if (ocr?.ok && ocrCoordinates) {
    if (!exif) await readExifSafely();
    return finish({
      found: true,
      coordinates: ocrCoordinates,
      source: 'ocr',
      confidence: ocr.confidence || 0,
      ocrStatus: ocr.ocrStatus || 'uncertain',
      indexFromOcr: ocr.indexFromOcr || null,
      indexStatus: ocr.indexStatus || (ocr.indexFromOcr ? 'uncertain' : 'missing'),
      coordinateQuality: ocr.coordinateQuality
        || ((ocr.warnings || []).includes('low_precision_coordinate') ? 'low_precision' : null),
      coordinatePrecision: ocr.coordinatePrecision || null,
      coordinateText: ocr.coordinateText || null,
      gpsWarnings: ocr.warnings || [],
      ocrAttemptCount: ocr.attempts?.length || 0,
      orientation: exif?.orientation || 1,
      debug: { ocr: debugOcr(ocr, true), ocrError, exif, exifError },
    });
  }

  if (!exif) await readExifSafely();

  const exifCoordinates = normalizeCoordinates(
    exif?.coordinates?.latitude,
    exif?.coordinates?.longitude,
  );
  if (exifCoordinates) {
    return finish({
      found: true,
      coordinates: exifCoordinates,
      source: 'exif',
      confidence: 1,
      ocrStatus: 'exif',
      indexFromOcr: ocr?.indexFromOcr || null,
      indexStatus: ocr?.indexStatus || (ocr?.indexFromOcr ? 'uncertain' : 'missing'),
      coordinateQuality: 'confident',
      coordinatePrecision: null,
      coordinateText: null,
      gpsWarnings: [],
      ocrAttemptCount: ocr?.attempts?.length || 0,
      orientation: exif?.orientation || 1,
      debug: { ocr: debugOcr(ocr, true), ocrError, exif, exifError },
    });
  }

  return finish({
    found: false,
    coordinates: null,
    source: null,
    confidence: ocr?.confidence || 0,
    ocrStatus: ocr?.ocrStatus || (ocrError ? 'error' : 'missing'),
    indexFromOcr: ocr?.indexFromOcr || null,
    indexStatus: ocr?.indexStatus || (ocr?.indexFromOcr ? 'uncertain' : 'missing'),
    coordinateQuality: (ocr?.warnings || []).includes('low_precision_coordinate') ? 'low_precision' : null,
    coordinatePrecision: ocr?.coordinatePrecision || null,
    coordinateText: ocr?.coordinateText || null,
    gpsWarnings: ocr?.warnings || [],
    ocrAttemptCount: ocr?.attempts?.length || 0,
    orientation: exif?.orientation || 1,
    debug: {
      ocr: debugOcr(ocr, true),
      ocrError,
      exif,
      exifError: exifError || exif?.exifError || null,
    },
  });
}
