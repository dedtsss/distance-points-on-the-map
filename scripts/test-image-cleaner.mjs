import assert from 'node:assert/strict';
import {
  isJpegArrayBuffer,
  stripJpegMetadataFromArrayBuffer,
} from '../src/features/cleanup/jpegMetadataStripper.js';
import { cleanImageForUpload } from '../src/features/cleanup/cleanImageForUpload.js';
import { calculateMemorySafeSize } from '../src/features/cleanup/canvasFallbackCleaner.js';

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
let canvasCalledForOrientedJpeg = false;
const cleaned = await cleanImageForUpload(stableJpeg, {
  orientation: 6,
  preferredFilename: 'cleaned.jpg',
  dependencies: {
    verify: async () => ({ checked: true, hasGps: false, hasExif: false, remainingKeys: [] }),
    cleanCanvas: async () => { canvasCalledForOrientedJpeg = true; throw new Error('must not run'); },
  },
});
assert.equal(cleaned.ok, true);
assert.equal(cleaned.method, 'binary-jpeg-strip');
assert.equal(canvasCalledForOrientedJpeg, false);
assert.notEqual(cleaned.file, stableJpeg);
assert.deepEqual(findSegmentMarkersBeforeScan(await cleaned.file.arrayBuffer()), [0xe0]);
assert.equal(cleaned.debug.orientation, 6);
assert.equal(cleaned.debug.selectedCleanupPath, 'binary-jpeg-strip');

assert.deepEqual(calculateMemorySafeSize(6000, 4000, 2800), {
  width: 2800,
  height: 1867,
  scale: 2800 / 6000,
  maxSide: 2800,
  resized: true,
});

let receivedCanvasMaxSide = 0;
const canvasFile = new File(['png'], 'source.png', { type: 'image/png' });
const canvasCleaned = await cleanImageForUpload(canvasFile, {
  orientation: 1,
  preferredFilename: 'canvas.jpg',
  dependencies: {
    cleanCanvas: async (_file, _orientation, filename, options) => {
      receivedCanvasMaxSide = options.maxSide;
      return {
        file: new File(['clean'], filename, { type: 'image/jpeg' }),
        debug: {
          sourceDimensions: { width: 6000, height: 4000 },
          outputDimensions: { width: 2800, height: 1867 },
          resize: calculateMemorySafeSize(6000, 4000, options.maxSide),
        },
      };
    },
    verify: async () => ({ checked: true, hasGps: false, hasExif: false, remainingKeys: [] }),
  },
});
assert.equal(canvasCleaned.ok, true);
assert.equal(canvasCleaned.method, 'canvas-fallback');
assert.equal(receivedCanvasMaxSide, 2800);
assert.equal(canvasCleaned.debug.canvasFallback.resize.resized, true);

const controlledFailure = await cleanImageForUpload(canvasFile, {
  dependencies: {
    cleanCanvas: async () => { throw new Error('Android decode failed'); },
  },
});
assert.equal(controlledFailure.ok, false);
assert.equal(controlledFailure.method, 'failed');
assert.equal(controlledFailure.debug.selectedCleanupPath, 'canvas-fallback');
assert.match(controlledFailure.debug.canvasFallback.error, /Android decode failed/);

console.log('image cleaner tests passed');
