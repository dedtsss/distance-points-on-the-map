import assert from 'node:assert/strict';
import {
  isJpegArrayBuffer,
  stripJpegMetadataFromArrayBuffer,
} from '../src/features/cleanup/jpegMetadataStripper.js';
import { cleanImageForUpload } from '../src/features/cleanup/cleanImageForUpload.js';

const bytes = (...values) => new Uint8Array(values);

const textBytes = (value) => new TextEncoder().encode(value);

const segment = (marker, payload) => {
  const length = payload.length + 2;
  return new Uint8Array([
    0xff,
    marker,
    (length >> 8) & 0xff,
    length & 0xff,
    ...payload,
  ]);
};

const concat = (...parts) => {
  const normalized = parts.map((part) => (part instanceof ArrayBuffer ? new Uint8Array(part) : part));
  const length = normalized.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;

  for (const part of normalized) {
    output.set(part, offset);
    offset += part.length;
  }

  return output.buffer;
};

const minimalScan = () => concat(
  bytes(0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00),
  bytes(0x00, 0x11, 0x22, 0xff, 0xd9),
);

const findSegmentMarkersBeforeScan = (arrayBuffer) => {
  const source = new Uint8Array(arrayBuffer);
  const markers = [];
  let offset = 2;

  while (offset < source.length) {
    if (source[offset] !== 0xff) break;
    const marker = source[offset + 1];
    if (marker === 0xda) break;
    markers.push(marker);
    const length = (source[offset + 2] << 8) + source[offset + 3];
    offset += 2 + length;
  }

  return markers;
};

const app0 = segment(0xe0, bytes(
  ...textBytes('JFIF\0'),
  0x01,
  0x02,
  0x00,
  0x00,
  0x01,
  0x00,
  0x01,
  0x00,
  0x00,
));

const jpegWithMetadata = concat(
  bytes(0xff, 0xd8),
  app0,
  segment(0xe1, textBytes('Exif\0\0GPS payload')),
  segment(0xe1, textBytes('http://ns.adobe.com/xap/1.0/\0xmp payload')),
  segment(0xe2, textBytes('ICC_PROFILE\0profile')),
  segment(0xed, textBytes('Photoshop 3.0\0iptc payload')),
  segment(0xfe, textBytes('private comment')),
  minimalScan(),
);

assert.equal(isJpegArrayBuffer(jpegWithMetadata), true);

const stripped = stripJpegMetadataFromArrayBuffer(jpegWithMetadata);
const strippedMarkers = findSegmentMarkersBeforeScan(stripped.arrayBuffer);

assert.equal(stripped.metadataRemoved, true);
assert.equal(stripped.removedSegments.length, 5);
assert.deepEqual(strippedMarkers, [0xe0]);
assert.equal(new Uint8Array(stripped.arrayBuffer)[0], 0xff);
assert.equal(new Uint8Array(stripped.arrayBuffer)[1], 0xd8);

const jpegWithoutMetadata = concat(
  bytes(0xff, 0xd8),
  app0,
  minimalScan(),
);
const untouched = stripJpegMetadataFromArrayBuffer(jpegWithoutMetadata);

assert.equal(untouched.metadataRemoved, false);
assert.equal(untouched.removedSegments.length, 0);
assert.deepEqual(findSegmentMarkersBeforeScan(untouched.arrayBuffer), [0xe0]);
assert.equal(isJpegArrayBuffer(bytes(0x89, 0x50, 0x4e, 0x47).buffer), false);
assert.throws(
  () => stripJpegMetadataFromArrayBuffer(bytes(0x89, 0x50, 0x4e, 0x47).buffer),
  /JPEG/,
);

const stableJpeg = new File([jpegWithMetadata], 'stable.jpg', { type: 'image/jpeg' });
const cleaned = await cleanImageForUpload(stableJpeg, {
  orientation: 1,
  preferredFilename: 'cleaned.jpg',
  dependencies: {
    verify: async () => ({ checked: true, hasGps: false, hasExif: false, remainingKeys: [] }),
  },
});
assert.equal(cleaned.ok, true);
assert.equal(cleaned.method, 'binary-jpeg-strip');
assert.notEqual(cleaned.file, stableJpeg);
assert.deepEqual(findSegmentMarkersBeforeScan(await cleaned.file.arrayBuffer()), [0xe0]);

console.log('image cleaner tests passed');
