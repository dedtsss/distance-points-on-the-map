import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createOnionDrop } from '../server.mjs';

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0, 4, 0, 0, 0xff, 0xda, 0, 2, 0xff, 0xd9]);

test('upload is anonymous, sanitized, and expires only after explicit view or unopened TTL', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'onion-drop-'));
  let time = 1_000;
  const app = await createOnionDrop({ storageDir: dir, now: () => time, unopenedMs: 1_000, viewedMs: 200 });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  try {
    const upload = await fetch(`${base}/v1/shares`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg', Origin: 'http://localhost' }, body: jpeg });
    assert.equal(upload.status, 201);
    const { viewPath } = await upload.json();
    assert.match(viewPath, /^\/v1\/shares\/[a-f0-9]{48}$/);
    const files = await readdir(dir);
    assert.equal(files.length, 1);
    assert.match(files[0], /^[a-f0-9]{64}\.jpg$/);
    assert.ok(!files[0].includes(viewPath.split('/').at(-1)));
    time = 1_500;
    assert.equal((await fetch(`${base}${viewPath}`)).status, 200);
    assert.equal((await fetch(`${base}${viewPath}/image`, { headers: { Range: 'bytes=0-1' } })).status, 403);
    assert.equal(app.shares.values().next().value.viewedAt, null);
    const intent = await fetch(`${base}${viewPath}/view`, { method: 'POST', redirect: 'manual', headers: { Origin: base } });
    assert.equal(intent.status, 303);
    const imagePath = intent.headers.get('location');
    assert.match(imagePath, /\?token=[a-f0-9]{48}$/);
    assert.equal((await fetch(`${base}${imagePath}`)).status, 200);
    assert.equal(app.shares.values().next().value.expiresAt, 1_700);
    time = 1_701;
    assert.equal((await fetch(`${base}${viewPath}/image`)).status, 404);
    assert.deepEqual(await readdir(dir), []);

    const second = await fetch(`${base}/v1/shares`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: jpeg });
    const secondPath = (await second.json()).viewPath;
    time = 2_702;
    assert.equal((await fetch(`${base}${secondPath}`)).status, 404);
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});

test('rejects metadata, non-JPEG bodies and foreign browser origins', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'onion-drop-'));
  const app = await createOnionDrop({ storageDir: dir });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  try {
    const exif = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0, 4, 1, 2, 0xff, 0xda, 0, 2, 0xff, 0xd9]);
    const headers = { 'Content-Type': 'image/jpeg' };
    assert.equal((await fetch(`${base}/v1/shares`, { method: 'POST', headers, body: exif })).status, 415);
    assert.equal((await fetch(`${base}/v1/shares`, { method: 'POST', headers, body: Buffer.from('hello') })).status, 415);
    assert.equal((await fetch(`${base}/v1/shares`, { method: 'POST', headers: { ...headers, Origin: 'https://example.com' }, body: jpeg })).status, 403);
    assert.deepEqual(await readdir(dir), []);
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});
