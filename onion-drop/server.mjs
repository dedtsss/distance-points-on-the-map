import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DEFAULT_UNOPENED_MS = 24 * 60 * 60 * 1000;
const DEFAULT_VIEWED_MS = 60 * 60 * 1000;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const ID_PATTERN = /^[a-f0-9]{48}$/;
const FILE_PATTERN = /^[a-f0-9]{64}\.jpg$/;
const send = (response, status, body = '', type = 'text/plain; charset=utf-8') => {
  response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; form-action 'self'; style-src 'unsafe-inline'" });
  response.end(body);
};

const readBody = async (request) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_IMAGE_BYTES) {
      const error = new Error('image too large'); error.status = 413; throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

const isJpeg = (bytes) => bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8
  && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;

const hasMetadataMarker = (bytes) => {
  let offset = 2;
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1];
    if (marker === 0xda) return false;
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) return true;
    if (marker === 0xe0) {
      const plainJfif = length >= 16 && bytes.toString('ascii', offset + 4, offset + 9) === 'JFIF\0'
        && bytes[offset + 16] === 0 && bytes[offset + 17] === 0;
      if (!plainJfif) return true;
    } else if ((marker >= 0xe1 && marker <= 0xef) || marker === 0xfe) return true;
    offset += 2 + length;
  }
  return true;
};

const allowedOrigin = (request) => {
  const origin = request.headers.origin;
  if (['http://localhost', 'https://localhost'].includes(origin)) return origin;
  if (!origin) return null;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol === 'http:' && parsed.host === request.headers.host) return origin;
  } catch { /* Invalid origins are denied. */ }
  return null;
};

export async function createOnionDrop(options = {}) {
  const storageDir = options.storageDir || '/var/lib/onion-drop';
  const now = options.now || Date.now;
  const unopenedMs = options.unopenedMs ?? DEFAULT_UNOPENED_MS;
  const viewedMs = options.viewedMs ?? DEFAULT_VIEWED_MS;
  if (unopenedMs <= 0 || viewedMs <= 0) throw new Error('TTLs must be positive');
  await mkdir(storageDir, { recursive: true, mode: 0o700 });
  const shares = new Map();
  const deleteShare = async (id) => {
    const share = shares.get(id);
    if (!share) return;
    shares.delete(id);
    await rm(join(storageDir, share.filename), { force: true });
  };
  const getShare = async (id) => {
    const share = shares.get(id);
    if (!share) return null;
    if (now() >= share.expiresAt) { await deleteShare(id); return null; }
    return share;
  };
  // Ephemeral by design: restart invalidates links and removes old stored files.
  for (const name of await readdir(storageDir)) {
    if (FILE_PATTERN.test(name)) await rm(join(storageDir, name), { force: true });
  }
  const handler = async (request, response) => {
    const requestUrl = new URL(request.url, 'http://localhost');
    const path = requestUrl.pathname;
    const origin = allowedOrigin(request);
    if (request.headers.origin && !origin) return send(response, 403);
    if (origin) response.setHeader('Access-Control-Allow-Origin', origin);
    if (request.method === 'OPTIONS' && path === '/v1/shares') {
      response.writeHead(204, { 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' });
      return response.end();
    }
    if (request.method === 'POST' && path === '/v1/shares') {
      if (request.headers['content-type'] !== 'image/jpeg') return send(response, 415, 'JPEG required');
      const bytes = await readBody(request);
      if (!isJpeg(bytes) || hasMetadataMarker(bytes)) return send(response, 415, 'Invalid or unsanitized JPEG');
      const id = randomBytes(24).toString('hex');
      const filename = `${randomBytes(32).toString('hex')}.jpg`;
      await writeFile(join(storageDir, filename), bytes, { flag: 'wx', mode: 0o600 });
      shares.set(id, { filename, expiresAt: now() + unopenedMs, viewedAt: null, viewToken: null });
      return send(response, 201, JSON.stringify({ viewPath: `/v1/shares/${id}` }), 'application/json; charset=utf-8');
    }
    const match = path.match(/^\/v1\/shares\/([a-f0-9]{48})(?:\/(view|image))?$/);
    if (!match || !ID_PATTERN.test(match[1])) return send(response, 404);
    const [, id, suffix] = match;
    const share = await getShare(id);
    if (!share) return send(response, 404);
    if (request.method === 'GET' && !suffix) {
      const html = '<!doctype html><meta name="viewport" content="width=device-width"><title>Photo</title><style>body{font:18px system-ui;background:#111;color:#fff;margin:2rem}button{font:inherit;padding:1rem}</style><form method="post" action="'+path+'/view"><button>Open photo</button></form>';
      return send(response, 200, html, 'text/html; charset=utf-8');
    }
    if (request.method === 'POST' && suffix === 'view') {
      if (share.viewedAt === null) {
        share.viewedAt = now();
        share.expiresAt = Math.min(share.expiresAt, share.viewedAt + viewedMs);
        share.viewToken = randomBytes(24).toString('hex');
      }
      response.writeHead(303, { Location: `/v1/shares/${id}/image?token=${share.viewToken}`, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
      return response.end();
    }
    if (request.method === 'GET' && suffix === 'image') {
      if (!share.viewToken || requestUrl.searchParams.get('token') !== share.viewToken) return send(response, 403);
      const bytes = await readFile(join(storageDir, share.filename));
      response.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': bytes.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Disposition': 'inline; filename="photo.jpg"' });
      return response.end(bytes);
    }
    return send(response, 405);
  };
  const server = createServer((request, response) => {
    handler(request, response).catch((error) => send(response, error.status || 500, error.status ? error.message : 'Internal error'));
  });
  const sweep = setInterval(() => {
    for (const [id, share] of shares) if (now() >= share.expiresAt) void deleteShare(id);
  }, options.sweepMs || 60_000);
  sweep.unref();
  server.on('close', () => clearInterval(sweep));
  return { server, shares, getShare, close: () => new Promise((resolve) => server.close(resolve)) };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const host = process.env.DARKFOTO_BIND || '127.0.0.1';
  if (host !== '127.0.0.1' && host !== '::1') throw new Error('onion-drop only binds to loopback');
  const port = Number(process.env.DARKFOTO_PORT || 8787);
  const app = await createOnionDrop({ storageDir: process.env.DARKFOTO_STORAGE || '/var/lib/onion-drop' });
  app.server.listen(port, host);
}
