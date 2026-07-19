import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

globalThis.localStorage = new MemoryStorage();

const {
  buildOcrDiagnosticReport,
  clearOcrDiagnostics,
  getOcrDiagnostics,
  recordOcrDiagnostic,
} = await import('../src/features/diagnostics/ocrDiagnostics.js');

recordOcrDiagnostic({
  stableFile: {
    name: 'IMG_0001.jpg',
    size: 123456,
    type: 'image/jpeg',
    lastModified: 1700000000000,
  },
  elapsedMs: 1450,
  result: {
    found: false,
    coordinates: null,
    confidence: 0.2,
    ocrStatus: 'missing',
    indexFromOcr: '6369',
    indexStatus: 'found',
    gpsWarnings: ['coordinates_not_found'],
    orientation: 1,
    debug: {
      ocrError: null,
      exifError: null,
      ocr: {
        rawText: '64.607016 N 30.622840 E',
        normalizedText: '64.607016 N 30.622840 E',
        attempts: [{
          name: 'bottom-right:threshold',
          cropName: 'bottom-right',
          overlayDetected: true,
          preprocessingMethod: 'threshold',
          pageSegMode: '7',
          rawText: '64.607016 N 30.622840 E',
          ocrConfidence: 0.71,
          rejectionReason: 'parser_low_confidence',
          cropPreview: 'data:image/png;base64,AAAA',
        }],
        indexAttempts: [{
          name: 'index-line',
          rawText: '6369',
          ocrConfidence: 0.93,
          indexCandidates: [{ value: '6369', confidence: 0.93 }],
        }],
        chosenCandidate: {
          apiToken: 'must-not-leak',
        },
      },
    },
  },
});

const records = getOcrDiagnostics();
assert.equal(records.length, 1);
assert.equal(records[0].file.name, 'IMG_0001.jpg');
assert.equal(records[0].result.indexFromOcr, '6369');
assert.equal(records[0].ocr.attempts.length, 1);
assert.equal(records[0].ocr.attempts[0].rawText, '64.607016 N 30.622840 E');
assert.equal(records[0].ocr.attempts[0].cropPreview, undefined);
assert.equal(records[0].ocr.chosenCandidate.apiToken, '[redacted]');

const report = buildOcrDiagnosticReport({
  journalEntries: [{ id: '1', message: 'OCR complete', type: 'success' }],
});
assert.equal(report.schema, 'gps-ocr-diagnostic-report-v1');
assert.equal(report.summary.photos, 1);
assert.equal(report.summary.coordinatesFound, 0);
assert.equal(report.summary.indexesFound, 1);
assert.equal(report.privacy.originalPhotosIncluded, false);
assert.equal(report.journal.length, 1);

clearOcrDiagnostics();
assert.equal(getOcrDiagnostics().length, 0);

console.log('OCR diagnostics tests passed');
