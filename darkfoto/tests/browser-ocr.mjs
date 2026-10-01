import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ configFile: new URL('../vite.config.js', import.meta.url).pathname, root: new URL('..', import.meta.url).pathname, logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await page.goto(base);
  const cases = [
    { name: 'black leading zero', kind: 'black', index: '0123', shifted: false, comma: false },
    { name: 'black shifted', kind: 'black', index: '1234', shifted: true, comma: true },
    { name: 'gray caption', kind: 'gray', index: '1234', shifted: false, comma: false },
  ];
  for (const fixture of cases) {
    const result = await page.evaluate(async ({ base, fixture }) => {
      const ocr = await import(`${base}src/core/features/gps/ocrReader.js`);
      const canvas = document.createElement('canvas');
      canvas.width = 1280; canvas.height = 960;
      const context = canvas.getContext('2d');
      context.fillStyle = '#d8dde7'; context.fillRect(0, 0, 1280, 960);
      const x = fixture.shifted ? 690 : fixture.kind === 'gray' ? 0 : 740;
      const y = fixture.shifted ? 770 : fixture.kind === 'gray' ? 800 : 810;
      const width = fixture.kind === 'gray' ? 1280 : 540;
      const height = fixture.kind === 'gray' ? 160 : 150;
      context.fillStyle = fixture.kind === 'gray' ? '#737d88' : '#05070a';
      context.fillRect(x, y, width, height);
      context.fillStyle = '#fff'; context.textBaseline = 'top';
      context.font = '700 32px Arial';
      context.fillText(fixture.comma ? '64,123456 N 30,123456 E' : '64.123456 N 30.123456 E', x + 26, y + 22);
      context.font = '800 38px Arial';
      context.fillText(fixture.index, x + 40, y + 78);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', .85));
      const file = new File([blob], 'fixture.jpg', { type: 'image/jpeg' });
      const parsed = await ocr.readCoordinatesWithOcr(file, {});
      let recoveredAfterMiss = null;
      if (fixture.name === 'black leading zero') {
        const { recognizeTextFromCanvas } = await import(`${base}src/core/utils/ocrGpsReader.js`);
        let missed = false;
        const retry = await ocr.readCoordinatesWithOcr(file, { dependencies: {
          recognize: async (canvas, options) => {
            if (!missed && options.whitelist === '0123456789') {
              missed = true;
              return { text: '', confidence: 0 };
            }
            return recognizeTextFromCanvas(canvas, options);
          },
        } });
        recoveredAfterMiss = { missed, index: retry.indexFromOcr, attempts: retry.indexAttempts?.length || 0 };
      }
      return { ok: parsed.ok, index: parsed.indexFromOcr, latitude: parsed.latitude, longitude: parsed.longitude,
        attempts: parsed.attempts?.map((attempt) => attempt.name), recoveredAfterMiss };
    }, { base, fixture });
    assert.equal(result.ok, true, JSON.stringify({ fixture, result }));
    assert.equal(result.index, fixture.index, JSON.stringify({ fixture, result }));
    assert.ok(Math.abs(result.latitude - 64.123456) < .0001, fixture.name);
    assert.ok(Math.abs(result.longitude - 30.123456) < .0001, fixture.name);
    assert.ok(result.attempts.every((name) => !name.startsWith('full_image')), fixture.name);
    if (fixture.name === 'black leading zero') {
      assert.equal(result.recoveredAfterMiss.missed, true);
      assert.equal(result.recoveredAfterMiss.index, '0123');
      assert.ok(result.recoveredAfterMiss.attempts > 1);
    }
    console.log(`${fixture.name}: ${result.index}, ${result.latitude}, ${result.longitude}`);
  }
  const cleanup = await page.evaluate(async (baseUrl) => {
    const { cleanImageForUpload } = await import(`${baseUrl}src/core/features/cleanup/cleanImageForUpload.js`);
    const canvas = document.createElement('canvas');
    canvas.width = 80; canvas.height = 80;
    canvas.getContext('2d').fillRect(0, 0, 80, 80);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg'));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const exif = new Uint8Array([0xff, 0xe1, 0, 8, 69, 120, 105, 102, 0, 0]);
    const original = new File([bytes.slice(0, 2), exif, bytes.slice(2)], 'private-name.jpg', { type: 'image/jpeg' });
    const before = new Uint8Array(await original.arrayBuffer());
    const result = await cleanImageForUpload(original, { preferredFilename: 'photo-test', orientation: 1 });
    const after = new Uint8Array(await original.arrayBuffer());
    return {
      ok: result.ok,
      filename: result.file?.name,
      verification: result.verification,
      originalsEqual: before.every((value, index) => value === after[index]),
      shorter: result.file?.size < original.size,
    };
  }, base);
  assert.equal(cleanup.ok, true, JSON.stringify(cleanup));
  assert.equal(cleanup.filename, 'photo-test.jpg');
  assert.equal(cleanup.verification.hasExif, false);
  assert.equal(cleanup.originalsEqual, true);
  assert.equal(cleanup.shorter, true);
  const oriented = await page.evaluate(async (baseUrl) => {
    const { cleanImageForUpload } = await import(`${baseUrl}src/core/features/cleanup/cleanImageForUpload.js`);
    const canvas = document.createElement('canvas');
    canvas.width = 80; canvas.height = 40;
    const context = canvas.getContext('2d');
    context.fillStyle = '#f00'; context.fillRect(0, 0, 40, 40);
    context.fillStyle = '#00f'; context.fillRect(40, 0, 40, 40);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', .95));
    const raw = new Uint8Array(await blob.arrayBuffer());
    const exif = new Uint8Array([
      0xff, 0xe1, 0, 34, 69, 120, 105, 102, 0, 0,
      73, 73, 42, 0, 8, 0, 0, 0, 1, 0,
      0x12, 0x01, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0,
      0, 0, 0, 0,
    ]);
    const original = new File([raw.slice(0, 2), exif, raw.slice(2)], 'rotated.jpg', { type: 'image/jpeg' });
    const result = await cleanImageForUpload(original, { orientation: 6, preferredFilename: 'photo-rotated' });
    if (!result.ok) return { ok: false, error: result.error, debug: result.debug };
    const image = await createImageBitmap(result.file);
    const output = document.createElement('canvas');
    output.width = image.width; output.height = image.height;
    const outputContext = output.getContext('2d');
    outputContext.drawImage(image, 0, 0);
    const top = outputContext.getImageData(20, 10, 1, 1).data;
    const bottom = outputContext.getImageData(20, 70, 1, 1).data;
    return { ok: true, width: image.width, height: image.height, top: [...top], bottom: [...bottom], hasExif: result.verification.hasExif };
  }, base);
  assert.equal(oriented.ok, true, JSON.stringify(oriented));
  assert.deepEqual([oriented.width, oriented.height], [40, 80]);
  assert.ok(oriented.top[0] > oriented.top[2], JSON.stringify(oriented));
  assert.ok(oriented.bottom[2] > oriented.bottom[0], JSON.stringify(oriented));
  assert.equal(oriented.hasExif, false);
} finally {
  await browser.close();
  await server.close();
}
