import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const imagePaths = process.argv.slice(2);

if (imagePaths.length === 0) {
  console.error('Usage: npm run debug:index-ocr -- <image.jpg> [image2.jpg]');
  process.exit(1);
}

const mimeForPath = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
};

const safeName = (value) => String(value || 'item')
  .replace(/[^a-z0-9._-]+/gi, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 96) || 'item';

const writeDataUrl = async (dataUrl, targetPath) => {
  if (!dataUrl || typeof dataUrl !== 'string') return false;
  const match = dataUrl.match(/^data:image\/[a-z0-9.+-]+;base64,(.+)$/i);
  if (!match) return false;
  await writeFile(targetPath, Buffer.from(match[1], 'base64'));
  return true;
};

const removePreviews = (value) => JSON.parse(JSON.stringify(value, (key, item) => (
  key === 'cropPreview' || key === 'processedPreview' ? undefined : item
)));

const outputRoot = path.resolve('output/ocr-index-debug');
await mkdir(outputRoot, { recursive: true });

const server = await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const baseUrl = server.resolvedUrls.local[0];
const moduleUrl = new URL('src/utils/ocrGpsReader.js', baseUrl).href;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });

  for (const imagePath of imagePaths) {
    const absolutePath = path.resolve(imagePath);
    const source = await readFile(absolutePath);
    const fileName = path.basename(absolutePath);
    const outputDir = path.join(outputRoot, safeName(path.basename(fileName, path.extname(fileName))));
    await mkdir(outputDir, { recursive: true });

    const debugResult = await page.evaluate(async ({ sourceUrl, fileName, mimeType, base64 }) => {
      const ocr = await import(sourceUrl);
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const file = new File([bytes], fileName, { type: mimeType });
      const result = await ocr.readGpsFromImageOcr(file, { debug: true, timeBudgetMs: 90_000 });
      const overlayBounds = (result.indexAttempts || []).find((attempt) => attempt.overlayBounds)?.overlayBounds || null;
      let overlayPreview = '';

      if (overlayBounds) {
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(overlayBounds.width));
        canvas.height = Math.max(1, Math.round(overlayBounds.height));
        const context = canvas.getContext('2d');
        context.drawImage(
          bitmap,
          overlayBounds.x,
          overlayBounds.y,
          overlayBounds.width,
          overlayBounds.height,
          0,
          0,
          canvas.width,
          canvas.height,
        );
        overlayPreview = canvas.toDataURL('image/png');
      }

      return { result, overlayPreview };
    }, {
      sourceUrl: moduleUrl,
      fileName,
      mimeType: mimeForPath(absolutePath),
      base64: source.toString('base64'),
    });

    await writeFile(
      path.join(outputDir, 'summary.json'),
      `${JSON.stringify(removePreviews(debugResult.result), null, 2)}\n`,
    );
    await writeDataUrl(debugResult.overlayPreview, path.join(outputDir, '00-black-overlay.png'));

    for (const [index, attempt] of (debugResult.result.indexAttempts || []).entries()) {
      const prefix = `${String(index + 1).padStart(2, '0')}-${safeName(attempt.name)}`;
      await writeDataUrl(attempt.cropPreview, path.join(outputDir, `${prefix}-index-crop.png`));
      await writeDataUrl(attempt.processedPreview, path.join(outputDir, `${prefix}-processed.png`));
      await writeFile(path.join(outputDir, `${prefix}-ocr.txt`), [
        `name: ${attempt.name}`,
        `crop: ${attempt.cropName || ''}`,
        `psm: ${attempt.pageSegMode || ''}`,
        `confidence: ${attempt.ocrConfidence ?? ''}`,
        `raw: ${attempt.rawText || ''}`,
        `normalized: ${attempt.normalizedText || ''}`,
        `candidates: ${JSON.stringify(attempt.indexCandidates || [])}`,
        '',
      ].join('\n'));
    }

    console.log(`${fileName}: index=${debugResult.result.indexFromOcr || 'missing'} status=${debugResult.result.indexStatus}`);
    console.log(`  debug: ${path.relative(process.cwd(), outputDir)}`);
  }
} finally {
  await browser.close();
  await server.close();
}
