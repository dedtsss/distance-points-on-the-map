import { uploadNinjabox } from '../../workers/host-proxy/ninjabox.js';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
};
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers });

// A canvas-reencoded JPEG has no camera metadata segments. Reject originals here too.
export function isSanitizedJpeg(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;
  let offset = 2;
  while (offset + 4 < bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1];
    if (marker === 0xda) return true;
    if (marker === 0xe1 || marker === 0xe2 || marker === 0xed || marker === 0xfe) return false;
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2) return false;
    offset += length + 2;
  }
  return false;
}

export async function handleNinjaboxRelay(request, uploader = uploadNinjabox) {
  const path = new URL(request.url).pathname;
  if (path !== '/v1/ninjabox') return json({ ok: false, error: 'Not found' }, 404);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return json({ ok: false, error: 'POST required' }, 405);
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.type !== 'image/jpeg' || file.size === 0 || file.size > 25 * 1024 * 1024
      || !isSanitizedJpeg(new Uint8Array(await file.arrayBuffer()))) {
      return json({ ok: false, error: 'Sanitized JPEG required' }, 400);
    }
    const result = await uploader([file]);
    const url = result?.items?.[0]?.url;
    if (!result?.ok || !/^https:\/\/ninjabox\.org\/i\/[a-zA-Z0-9/_-]+$/.test(url || '')) {
      return json({ ok: false, error: 'NinjaBox did not return a photo link' }, 502);
    }
    return json({ ok: true, url });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'Upload failed' }, 502);
  }
}

export default { fetch: handleNinjaboxRelay };
