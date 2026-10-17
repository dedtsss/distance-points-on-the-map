import { uploadNinjabox } from '../../workers/host-proxy/ninjabox.js';
import { MAX_POINT_BYTES, validatePointFiles, validPhotoUrl, validGalleryUrl } from '../src/core/ninjaboxContract.js';

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
    const contentLength = Number(request.headers.get('content-length'));
    if (contentLength > MAX_POINT_BYTES + 1024 * 1024) return json({ ok: false, error: 'Point too large' }, 413);
    const form = await request.formData();
    const files = form.getAll('file');
    if ([...form.keys()].some((key) => key !== 'file')
      || !files.every((file) => file instanceof File) || !validatePointFiles(files)) {
      return json({ ok: false, error: 'Bounded sanitized JPEG point required' }, 400);
    }
    for (const file of files) {
      if (!isSanitizedJpeg(new Uint8Array(await file.arrayBuffer()))) {
        return json({ ok: false, error: 'Sanitized JPEG required' }, 400);
      }
    }
    const result = await uploader(files);
    const url = result?.items?.[0]?.url;
    if (!result?.ok || result?.items?.length !== files.length
      || !result.items.every((item) => validPhotoUrl(item.url))
      || new Set(result.items.map((item) => item.url)).size !== files.length
      || (files.length > 1 && !validGalleryUrl(result.galleryUrl))) {
      return json({ ok: false, error: 'NinjaBox did not return the expected point links' }, 502);
    }
    return files.length === 1 ? json({ ok: true, url })
      : json({ ok: true, galleryUrl: result.galleryUrl, itemCount: result.items.length });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'Upload failed' }, 502);
  }
}

export default {
  fetch(request) {
    return handleNinjaboxRelay(request);
  },
};
