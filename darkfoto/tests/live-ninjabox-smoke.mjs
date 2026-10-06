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
  const result = await page.evaluate(async ({ baseUrl, relayUrl }) => {
    const { cleanImageForUpload } = await import(`${baseUrl}src/core/features/cleanup/cleanImageForUpload.js`);
    const { publishCleanImageToNinjabox } = await import(`${baseUrl}src/core/publisher.js`);
    const response = await fetch(`${baseUrl}tests/fixtures/representative-6301.jpg`);
    if (!response.ok) throw new Error(`Fixture HTTP ${response.status}`);
    const source = new File([await response.blob()], 'representative-6301.jpg', { type: 'image/jpeg' });
    const clean = await cleanImageForUpload(source, { preferredFilename: 'darkfoto-smoke', orientation: 1 });
    if (!clean.ok) throw new Error(`Cleanup failed: ${clean.error}`);
    const link = await publishCleanImageToNinjabox(clean.file, relayUrl);
    return { link, bytes: clean.file.size, method: clean.method };
  }, { baseUrl: base, relayUrl: relay });
  assert.match(result.link, /^https:\/\/ninjabox\.org\/i\//);
  console.log(`NinjaBox cleaned representative JPEG (${result.bytes} bytes, ${result.method}): ${result.link}`);
} finally {
  await browser.close();
  await server.close();
}
