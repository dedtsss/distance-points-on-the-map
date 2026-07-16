import { deflateSync } from 'node:zlib';

const WORKER_URL = process.env.WORKER_URL || 'https://gps.bruce-group.net/api/upload';
const WORKER_ACCESS_TOKEN = process.env.WORKER_ACCESS_TOKEN || process.env.APP_ACCESS_TOKEN || '';
const CF_ACCESS_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID || '';
const CF_ACCESS_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET || '';
const TARGETS = (process.env.TARGETS || 'bundle').split(',').map((item) => item.trim()).filter(Boolean);
const REQUIRE_MODE = process.env.REQUIRE_MODE || 'all';

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value >>> 0;
});

const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
};

const pngChunk = (type, data) => {
  const typeBytes = Buffer.from(type);
  const length = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, checksum]);
};

const makeTestFile = (index) => {
  const width = 1024;
  const height = 768;
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width + 1);
    for (let x = 0; x < width; x += 1) raw[row + x + 1] = (x + y + index * 17) & 0xff;
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  const bytes = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  return new File([bytes], `worker-smoke-${Date.now()}-${index}.png`, { type: 'image/png' });
};

const isValidHttpUrl = (value) => {
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
};

async function testTarget(target) {
  const formData = new FormData();
  formData.append('target', target);
  if (target === 'bundle' || target === 'ninjabox') {
    for (let index = 0; index < 2; index += 1) {
      formData.append('photoId', `smoke-${index + 1}`);
      formData.append('files', makeTestFile(index), `worker-smoke-${index + 1}.png`);
    }
  } else {
    formData.append('file', makeTestFile(0));
  }

  const startedAt = Date.now();
  try {
    const headers = {};
    if (WORKER_ACCESS_TOKEN) headers['X-App-Access-Token'] = WORKER_ACCESS_TOKEN;
    if (CF_ACCESS_CLIENT_ID && CF_ACCESS_CLIENT_SECRET) {
      headers['CF-Access-Client-Id'] = CF_ACCESS_CLIENT_ID;
      headers['CF-Access-Client-Secret'] = CF_ACCESS_CLIENT_SECRET;
    }
    const response = await fetch(WORKER_URL, { method: 'POST', body: formData, headers });
    const text = await response.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* included below */ }

    const bundleOk = target === 'bundle'
      && data?.items?.length === 2
      && data.items.every((item) => item.links?.length === 2
        && item.providers?.freeimage?.ok
        && item.providers?.ninjabox?.ok
        && item.providers?.x0 === null);
    const singleUrl = data?.url || data?.items?.[0]?.url || null;
    const ok = response.ok && (bundleOk || (data?.ok === true && (isValidHttpUrl(singleUrl) || target === 'ninjabox')));

    return {
      target,
      ok,
      httpStatus: response.status,
      durationMs: Date.now() - startedAt,
      url: target === 'bundle' ? data?.items?.[0]?.links?.[0]?.url || null : singleUrl,
      response: data || text.slice(0, 4000),
    };
  } catch (error) {
    return { target, ok: false, networkError: error instanceof Error ? error.message : String(error), durationMs: Date.now() - startedAt };
  }
}

const results = [];
for (const target of TARGETS) {
  console.log(`Testing ${target} via ${WORKER_URL}`);
  const result = await testTarget(target);
  results.push(result);
  console.log(JSON.stringify(result, null, 2));
}

console.log('SMOKE_TEST_SUMMARY_BEGIN');
for (const result of results) console.log(`${result.ok ? 'OK' : 'FAIL'} ${result.target} status=${result.httpStatus ?? 'network'} durationMs=${result.durationMs} url=${result.url || '-'}`);
console.log('SMOKE_TEST_SUMMARY_END');

const passed = REQUIRE_MODE === 'any' ? results.some((result) => result.ok) : results.every((result) => result.ok);
if (!passed) process.exit(1);
