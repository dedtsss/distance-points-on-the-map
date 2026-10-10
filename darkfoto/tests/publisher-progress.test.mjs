import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publishCleanImageToNinjabox } from '../src/core/publisher.js';

const relay = 'https://relay.example/v1/ninjabox';
const jpeg = new File(['clean'], 'clean.jpg', { type: 'image/jpeg' });

test('XHR reports measured upload bytes and validates relay response', async () => {
  const prior = globalThis.XMLHttpRequest;
  const measured = [];
  class FakeXHR {
    upload = {};
    responseURL = relay;
    status = 200;
    responseText = JSON.stringify({ ok: true, url: 'https://ninjabox.org/i/valid' });
    open(method, url) { assert.equal(method, 'POST'); assert.equal(url, relay); }
    send(form) {
      assert.equal(form.get('file').type, 'image/jpeg');
      this.upload.onprogress({ lengthComputable: true, loaded: 5, total: 10 });
      this.upload.onprogress({ lengthComputable: false, loaded: 10, total: 10 });
      this.onload();
    }
  }
  try {
    globalThis.XMLHttpRequest = FakeXHR;
    assert.equal(await publishCleanImageToNinjabox(jpeg, relay, {
      onProgress: (loaded, total) => measured.push([loaded, total]),
    }), 'https://ninjabox.org/i/valid');
    assert.deepEqual(measured, [[5, 10]]);
  } finally { globalThis.XMLHttpRequest = prior; }
});

test('XHR rejects malformed response and preserves bounded timeout', async () => {
  const prior = globalThis.XMLHttpRequest;
  class FakeXHR {
    upload = {};
    responseURL = relay;
    status = 200;
    responseText = JSON.stringify({ ok: true, url: 'https://elsewhere.example/i/invalid' });
    open() {}
    send() { this.onload(); }
  }
  try {
    globalThis.XMLHttpRequest = FakeXHR;
    await assert.rejects(publishCleanImageToNinjabox(jpeg, relay, { onProgress: () => {} }), /неверную ссылку/);
    FakeXHR.prototype.send = function () { this.ontimeout(); };
    await assert.rejects(publishCleanImageToNinjabox(jpeg, relay, { onProgress: () => {}, timeoutMs: 15 }), /тайм-аут 1 с/);
  } finally { globalThis.XMLHttpRequest = prior; }
});
