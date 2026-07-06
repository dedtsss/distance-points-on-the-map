import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const cases = [
  {
    fixture: 'tests/fixtures/photos/black-bottom-right-overlay-crop.jpg',
    detectorExport: 'detectBlackBottomRightOverlay',
    detectorName: 'black_bottom_right_overlay',
    latitude: 64.604344,
    longitude: 30.591954,
  },
  {
    fixture: 'tests/fixtures/photos/gray-bottom-caption-overlay-crop.jpg',
    detectorExport: 'detectGrayBottomCaptionOverlay',
    detectorName: 'gray_bottom_caption_overlay',
    latitude: 64.60271,
    longitude: 30.61999,
  },
];

const server = await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const baseUrl = server.resolvedUrls.local[0];
const moduleUrl = new URL('src/utils/ocrGpsReader.js', baseUrl).href;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  for (const testCase of cases) {
    const fixtureUrl = new URL(testCase.fixture, baseUrl).href;
    const result = await page.evaluate(async ({ sourceUrl, imageUrl, detectorExport }) => {
      const ocr = await import(sourceUrl);
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const file = new File([blob], imageUrl.split('/').at(-1), { type: 'image/jpeg' });
      const image = await ocr.loadImageFromFile(file);
      const detection = ocr[detectorExport](image);
      const parsed = await ocr.readGpsFromImageOcr(file, { timeBudgetMs: 45_000 });
      return {
        detection: { found: detection.found, detectorName: detection.detectorName, bounds: detection.bounds },
        parsed: {
          ok: parsed.ok,
          latitude: parsed.latitude,
          longitude: parsed.longitude,
          ocrStatus: parsed.ocrStatus,
          attempts: parsed.attempts.map((attempt) => ({
            name: attempt.name,
            detectorName: attempt.detectorName,
            overlayDetected: attempt.overlayDetected,
            pageSegMode: attempt.pageSegMode,
            rawText: attempt.rawText,
            normalizedText: attempt.normalizedText,
            chosenSource: attempt.parsed?.chosenCandidate?.source || null,
          })),
        },
      };
    }, { sourceUrl: moduleUrl, imageUrl: fixtureUrl, detectorExport: testCase.detectorExport });

    assert.equal(result.detection.found, true, testCase.fixture);
    assert.equal(result.detection.detectorName, testCase.detectorName, testCase.fixture);
    assert.ok(result.detection.bounds.width > 0 && result.detection.bounds.height > 0, testCase.fixture);
    assert.equal(result.parsed.ok, true, testCase.fixture);
    assert.equal(result.parsed.latitude, testCase.latitude, testCase.fixture);
    assert.equal(result.parsed.longitude, testCase.longitude, testCase.fixture);
    assert.equal(result.parsed.ocrStatus, 'confident', testCase.fixture);
    const detectorAttempt = result.parsed.attempts.find((attempt) => (
      attempt.detectorName === testCase.detectorName
      && attempt.overlayDetected
      && attempt.chosenSource
    ));
    assert.ok(detectorAttempt, testCase.fixture);
    assert.equal(detectorAttempt.pageSegMode, '7', testCase.fixture);
    assert.match(detectorAttempt.normalizedText, /64\.60\d+/i, testCase.fixture);
  }
} finally {
  await browser.close();
  await server.close();
}

console.log('Real overlay fixture tests passed');
