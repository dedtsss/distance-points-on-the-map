const STORAGE_KEY = 'gps-ocr-diagnostics-v1';
const CHANGE_EVENT = 'gps-ocr-diagnostics-updated';
const MAX_RECORDS = 40;
const MAX_ATTEMPTS = 32;
const MAX_TEXT_LENGTH = 4000;
const SENSITIVE_KEY_RE = /(password|passwd|token|secret|authorization|cookie|api[_-]?key|credential)/i;

const storage = () => {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
};

const truncateText = (value, limit = MAX_TEXT_LENGTH) => {
  const text = String(value || '');
  return text.length > limit ? `${text.slice(0, limit)}…[truncated ${text.length - limit} chars]` : text;
};

const safeNumber = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);

const compactBounds = (bounds) => {
  if (!bounds || typeof bounds !== 'object') return null;
  return {
    x: safeNumber(bounds.x),
    y: safeNumber(bounds.y),
    width: safeNumber(bounds.width),
    height: safeNumber(bounds.height),
  };
};

const compactDimensions = (dimensions) => {
  if (!dimensions || typeof dimensions !== 'object') return null;
  return {
    width: safeNumber(dimensions.width),
    height: safeNumber(dimensions.height),
  };
};

const compactAttempt = (attempt = {}) => ({
  name: truncateText(attempt.name, 240),
  cropName: truncateText(attempt.cropName, 160),
  detectorName: truncateText(attempt.detectorName, 160),
  overlayDetected: attempt.overlayDetected === true ? true : attempt.overlayDetected === false ? false : null,
  overlayBounds: compactBounds(attempt.overlayBounds || attempt.overlayDetection?.bounds),
  cropBounds: compactBounds(attempt.cropBounds),
  cropDimensions: compactDimensions(attempt.cropDimensions),
  preparedDimensions: compactDimensions(attempt.preparedDimensions),
  preprocessingMethod: truncateText(attempt.preprocessingMethod, 120),
  pageSegMode: truncateText(attempt.pageSegMode, 20),
  rawText: truncateText(attempt.rawText),
  normalizedText: truncateText(attempt.normalizedText),
  parserConfidence: safeNumber(attempt.parserConfidence),
  ocrConfidence: safeNumber(attempt.ocrConfidence),
  correctionCount: safeNumber(attempt.correctionCount),
  score: safeNumber(attempt.score),
  warnings: Array.isArray(attempt.warnings) ? attempt.warnings.map((value) => truncateText(value, 160)).slice(0, 20) : [],
  rejectionReason: truncateText(attempt.rejectionReason, 500),
  indexCandidates: Array.isArray(attempt.indexCandidates)
    ? attempt.indexCandidates.slice(0, 20).map((candidate) => ({
      value: truncateText(candidate?.value || candidate?.index || candidate?.text, 80),
      status: truncateText(candidate?.status, 80),
      confidence: safeNumber(candidate?.confidence ?? candidate?.ocrConfidence),
      source: truncateText(candidate?.source, 120),
    }))
    : [],
  elapsedMs: safeNumber(attempt.elapsedMs),
});

const compactOcr = (ocr = {}) => ({
  rawText: truncateText(ocr.rawText),
  normalizedText: truncateText(ocr.normalizedText),
  confidence: safeNumber(ocr.confidence),
  ocrConfidence: safeNumber(ocr.ocrConfidence),
  ocrStatus: truncateText(ocr.ocrStatus, 120),
  warnings: Array.isArray(ocr.warnings) ? ocr.warnings.map((value) => truncateText(value, 160)).slice(0, 30) : [],
  chosenCandidate: ocr.chosenCandidate || null,
  candidates: Array.isArray(ocr.candidates) ? ocr.candidates.slice(0, 30) : [],
  indexFromOcr: ocr.indexFromOcr || null,
  indexStatus: ocr.indexStatus || (ocr.indexFromOcr ? 'uncertain' : 'missing'),
  chosenIndexCandidate: ocr.chosenIndexCandidate || null,
  indexCandidates: Array.isArray(ocr.indexCandidates) ? ocr.indexCandidates.slice(0, 30) : [],
  indexCropBounds: compactBounds(ocr.indexCropBounds),
  indexOcrConfidence: safeNumber(ocr.indexOcrConfidence),
  attempts: Array.isArray(ocr.attempts) ? ocr.attempts.slice(0, MAX_ATTEMPTS).map(compactAttempt) : [],
  indexAttempts: Array.isArray(ocr.indexAttempts) ? ocr.indexAttempts.slice(0, MAX_ATTEMPTS).map(compactAttempt) : [],
});

const sanitizeValue = (value, key = '', depth = 0) => {
  if (SENSITIVE_KEY_RE.test(key)) return '[redacted]';
  if (depth > 8) return '[depth limit]';
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.startsWith('data:image/')) return `[image preview omitted: ${value.length} chars]`;
    return truncateText(value);
  }
  if (typeof File !== 'undefined' && value instanceof File) return `[File omitted: ${value.name || 'unnamed'}]`;
  if (typeof Blob !== 'undefined' && value instanceof Blob) return `[Blob omitted: ${value.size || 0} bytes]`;
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return '[binary data omitted]';
  if (Array.isArray(value)) return value.slice(0, 80).map((item) => sanitizeValue(item, key, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [
      childKey,
      sanitizeValue(childValue, childKey, depth + 1),
    ]));
  }
  return truncateText(value);
};

const loadRecords = () => {
  const target = storage();
  if (!target) return [];
  try {
    const parsed = JSON.parse(target.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.slice(-MAX_RECORDS) : [];
  } catch {
    return [];
  }
};

const saveRecords = (records) => {
  const target = storage();
  if (!target) return;
  try {
    target.setItem(STORAGE_KEY, JSON.stringify(records.slice(-MAX_RECORDS)));
  } catch {
    // Diagnostics must never interrupt photo processing when local storage is full or unavailable.
  }
};

const notifyChanged = () => {
  try {
    globalThis.dispatchEvent?.(new CustomEvent(CHANGE_EVENT));
  } catch {
    // CustomEvent is not available in some non-browser test environments.
  }
};

export const getOcrDiagnostics = () => loadRecords();

export const subscribeOcrDiagnostics = (listener) => {
  if (!globalThis.addEventListener) return () => {};
  const handler = () => listener(loadRecords());
  globalThis.addEventListener(CHANGE_EVENT, handler);
  return () => globalThis.removeEventListener(CHANGE_EVENT, handler);
};

export const clearOcrDiagnostics = () => {
  const target = storage();
  try {
    target?.removeItem(STORAGE_KEY);
  } catch {
    // Ignore unavailable storage.
  }
  notifyChanged();
};

export const recordOcrDiagnostic = ({ stableFile, elapsedMs, result }) => {
  const fileName = stableFile?.name || 'unknown-file';
  const fileKey = `${fileName}:${stableFile?.size || 0}:${stableFile?.lastModified || 0}`;
  const ocr = result?.debug?.ocr || {};
  const record = sanitizeValue({
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    fileKey,
    timestamp: new Date().toISOString(),
    file: {
      name: fileName,
      size: stableFile?.size || 0,
      type: stableFile?.type || '',
      lastModified: stableFile?.lastModified || null,
    },
    elapsedMs: safeNumber(elapsedMs),
    result: {
      found: result?.found === true,
      source: result?.source || null,
      coordinates: result?.coordinates || null,
      confidence: safeNumber(result?.confidence),
      ocrStatus: result?.ocrStatus || 'missing',
      indexFromOcr: result?.indexFromOcr || null,
      indexStatus: result?.indexStatus || (result?.indexFromOcr ? 'uncertain' : 'missing'),
      coordinateQuality: result?.coordinateQuality || null,
      coordinatePrecision: result?.coordinatePrecision || null,
      coordinateText: result?.coordinateText || null,
      warnings: result?.gpsWarnings || [],
      orientation: result?.orientation || 1,
    },
    errors: {
      ocr: result?.debug?.ocrError || null,
      exif: result?.debug?.exifError || null,
    },
    ocr: compactOcr(ocr),
  });

  const current = loadRecords().filter((item) => item.fileKey !== fileKey);
  current.push(record);
  saveRecords(current);
  notifyChanged();
  return record;
};

const reportSummary = (records) => ({
  photos: records.length,
  coordinatesFound: records.filter((item) => item.result?.found).length,
  coordinatesMissing: records.filter((item) => !item.result?.found).length,
  indexesFound: records.filter((item) => Boolean(item.result?.indexFromOcr)).length,
  indexesMissing: records.filter((item) => !item.result?.indexFromOcr).length,
  totalCoordinateAttempts: records.reduce((sum, item) => sum + (item.ocr?.attempts?.length || 0), 0),
  totalIndexAttempts: records.reduce((sum, item) => sum + (item.ocr?.indexAttempts?.length || 0), 0),
});

export const buildOcrDiagnosticReport = ({ journalEntries = [] } = {}) => {
  const records = loadRecords();
  return sanitizeValue({
    schema: 'gps-ocr-diagnostic-report-v1',
    generatedAt: new Date().toISOString(),
    app: {
      version: import.meta.env?.VITE_APP_VERSION || null,
      commit: import.meta.env?.VITE_COMMIT_SHA || import.meta.env?.VITE_GIT_COMMIT || null,
      branch: import.meta.env?.VITE_GIT_BRANCH || null,
      buildTime: import.meta.env?.VITE_BUILD_TIME || null,
      location: globalThis.location ? `${globalThis.location.origin}${globalThis.location.pathname}` : null,
      userAgent: globalThis.navigator?.userAgent || null,
      language: globalThis.navigator?.language || null,
    },
    privacy: {
      originalPhotosIncluded: false,
      binaryBuffersIncluded: false,
      imagePreviewsIncluded: false,
      sensitiveKeysRedacted: true,
    },
    summary: reportSummary(records),
    journal: Array.isArray(journalEntries) ? journalEntries.slice(-300) : [],
    photos: records,
  });
};

export const downloadOcrDiagnosticReport = ({ journalEntries = [] } = {}) => {
  const report = buildOcrDiagnosticReport({ journalEntries });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `gps-ocr-diagnostic-${stamp}.json`;
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return fileName;
};
