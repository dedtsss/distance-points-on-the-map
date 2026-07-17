import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const cases = [
  {
    name: 'four-digit-leading-zero',
    coordinateLine: '64.123456, 30.123456',
    indexLine: '0123',
    expectedIndex: '0123',
    block: { width: 540, height: 150, paddingX: 28, paddingY: 26 },
    font: { coordinate: 32, index: 38 },
    quality: 0.82,
  },
  {
    name: 'five-digit-directional',
    coordinateLine: '64.123456 N 30.123456 E',
    indexLine: '12345',
    expectedIndex: '12345',
    block: { width: 620, height: 168, paddingX: 34, paddingY: 30 },
    font: { coordinate: 30, index: 34 },
    quality: 0.68,
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
    const result = await page.evaluate(async ({ sourceUrl, testCase }) => {
      const ocr = await import(sourceUrl);
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 960;
      const context = canvas.getContext('2d');
      context.fillStyle = '#d8dde7';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#aeb7c6';
      for (let index = 0; index < 18; index += 1) {
        context.fillRect(0, index * 54, canvas.width, 1);
      }
      const block = testCase.block;
      const x = canvas.width - block.width;
      const y = canvas.height - block.height;
      context.fillStyle = '#05070a';
      context.fillRect(x, y, block.width, block.height);
      context.fillStyle = '#f8fbff';
      context.textBaseline = 'top';
      context.font = `700 ${testCase.font.coordinate}px Arial, sans-serif`;
      context.fillText(testCase.coordinateLine, x + block.paddingX, y + block.paddingY);
      context.font = `800 ${testCase.font.index}px Arial, sans-serif`;
      context.fillText(testCase.indexLine, x + block.paddingX + 12, y + block.paddingY + testCase.font.coordinate + 24);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', testCase.quality));
      const file = new File([blob], `${testCase.name}.jpg`, { type: 'image/jpeg' });
      const startedAt = performance.now();
      try {
        const parsed = await ocr.readGpsFromImageOcr(file, { timeBudgetMs: 70_000 });
        return {
          ok: parsed.ok,
          latitude: parsed.latitude,
          longitude: parsed.longitude,
          indexFromOcr: parsed.indexFromOcr,
          indexStatus: parsed.indexStatus,
          chosenIndexCandidate: parsed.chosenIndexCandidate,
          elapsedMs: Math.round(performance.now() - startedAt),
          error: null,
          indexAttempts: (parsed.indexAttempts || []).map((attempt) => ({
            name: attempt.name,
            rawText: attempt.rawText,
            normalizedText: attempt.normalizedText,
            ocrConfidence: attempt.ocrConfidence,
            rejectionReason: attempt.rejectionReason,
            candidates: attempt.indexCandidates?.map((candidate) => candidate.value),
          })),
        };
      } catch (error) {
        return {
          ok: false,
          indexFromOcr: null,
          indexStatus: 'missing',
          chosenIndexCandidate: null,
          elapsedMs: Math.round(performance.now() - startedAt),
          error: error instanceof Error ? error.message : String(error),
          indexAttempts: [],
        };
      }
    }, { sourceUrl: moduleUrl, testCase });

    const recognitionAttemptCount = result.indexAttempts.filter((attempt) => attempt.name !== 'index_time_budget').length;
    assert.equal(result.error, null, testCase.name);
    assert.equal(result.indexFromOcr, testCase.expectedIndex, testCase.name);
    assert.match(result.indexStatus, /^(found|uncertain)$/, testCase.name);
    assert.ok(recognitionAttemptCount > 0, testCase.name);
    assert.ok(recognitionAttemptCount <= 10, testCase.name);
    assert.ok(Number.isFinite(result.elapsedMs) && result.elapsedMs >= 0, testCase.name);
    assert.ok(result.chosenIndexCandidate, testCase.name);
    console.log(`${testCase.name}: elapsedMs=${result.elapsedMs} indexAttempts=${recognitionAttemptCount} index=${result.indexFromOcr} error=${result.error || 'none'}`);
  }
} finally {
  await browser.close();
  await server.close();
}

console.log('Synthetic index OCR fixture tests passed');
