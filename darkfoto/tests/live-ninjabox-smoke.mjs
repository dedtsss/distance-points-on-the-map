import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const relay = process.env.DARKFOTO_NINJABOX_RELAY_URL;
assert.ok(relay, 'DARKFOTO_NINJABOX_RELAY_URL is required');
const server = await createServer({ configFile: new URL('../vite.config.js', import.meta.url).pathname,
  root: new URL('..', import.meta.url).pathname, logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await page.goto(base);
  const link = await page.evaluate(async ({ baseUrl, relayUrl }) => {
    const { cleanImageForUpload } = await import(`${baseUrl}src/core/features/cleanup/cleanImageForUpload.js`);
    const { publishCleanImageToNinjabox } = await import(`${baseUrl}src/core/publisher.js`);
    const canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = 480;
    const context = canvas.getContext('2d');
    context.fillStyle = '#233e5a'; context.fillRect(0, 0, 640, 480);
    context.fillStyle = '#fff'; context.font = 'bold 36px sans-serif';
    context.fillText('DarkFoto synthetic smoke', 40, 240);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    const source = new File([blob], 'synthetic.jpg', { type: 'image/jpeg' });
    const clean = await cleanImageForUpload(source, { preferredFilename: 'darkfoto-smoke', orientation: 1 });
    if (!clean.ok) throw new Error(`Cleanup failed: ${clean.error}`);
    return publishCleanImageToNinjabox(clean.file, relayUrl);
  }, { baseUrl: base, relayUrl: relay });
  assert.match(link, /^https:\/\/ninjabox\.org\/i\//);
  console.log(`NinjaBox synthetic cleaned upload: ${link}`);
} finally {
  await browser.close();
  await server.close();
}
