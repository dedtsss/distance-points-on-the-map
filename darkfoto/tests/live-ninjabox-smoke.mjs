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
    const blob = await response.blob();

    const clean = async (name) => {
      const source = new File([blob], 'representative-6301.jpg', { type: 'image/jpeg' });
      const cleaned = await cleanImageForUpload(source, { preferredFilename: name, orientation: 1 });
      if (!cleaned.ok) throw new Error(`Cleanup failed: ${cleaned.error}`);
      return cleaned;
    };

    const single = await clean('darkfoto-smoke-single');
    const singleLink = await publishCleanImageToNinjabox(single.file, relayUrl);

    const first = await clean('darkfoto-smoke-group-01');
    const second = await clean('darkfoto-smoke-group-02');
    const galleryLink = await publishCleanImageToNinjabox([first.file, second.file], relayUrl);

    return {
      singleLink,
      galleryLink,
      bytes: [single.file.size, first.file.size, second.file.size],
      methods: [single.method, first.method, second.method],
    };
  }, { baseUrl: base, relayUrl: relay });

  assert.match(result.singleLink, /^https:\/\/ninjabox\.org\/i\//);
  assert.match(result.galleryLink, /^https:\/\/ninjabox\.org\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i);
  console.log(`NinjaBox single link: ${result.singleLink}`);
  console.log(`NinjaBox 2-photo gallery: ${result.galleryLink}`);
  console.log(`Cleaned bytes: ${result.bytes.join(', ')}; methods: ${result.methods.join(', ')}`);
} finally {
  await browser.close();
  await server.close();
}
