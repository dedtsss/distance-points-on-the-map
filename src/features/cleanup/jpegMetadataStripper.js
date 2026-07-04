const JPEG_SOI = 0xd8;
const JPEG_SOS = 0xda;
const JPEG_EOI = 0xd9;

const REMOVABLE_MARKERS = new Set([0xe1, 0xe2, 0xed, 0xfe]);

const markerName = (marker) => ({
  0xe1: 'APP1 EXIF/XMP',
  0xe2: 'APP2 ICC profile',
  0xed: 'APP13 IPTC/Photoshop',
  0xfe: 'COM comment',
}[marker] || `marker 0x${marker.toString(16)}`);

const isStandaloneMarker = (marker) => (
  marker === 0x01
  || marker === JPEG_EOI
  || (marker >= 0xd0 && marker <= 0xd7)
);

export const isJpegFile = (file) => {
  const type = String(file?.type || '').toLowerCase();
  const name = String(file?.name || '').toLowerCase();
  return type === 'image/jpeg' || type === 'image/jpg' || /\.(jpe?g)$/i.test(name);
};

export const isJpegArrayBuffer = (arrayBuffer) => {
  const bytes = new Uint8Array(arrayBuffer);
  return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === JPEG_SOI;
};

export function stripJpegMetadataFromArrayBuffer(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  if (!isJpegArrayBuffer(arrayBuffer)) throw new Error('Файл не является JPEG');

  const parts = [bytes.slice(0, 2)];
  let offset = 2;
  let outputLength = 2;
  let removedBytes = 0;
  const removedSegments = [];

  const append = (start, end) => {
    if (end <= start) return;
    const part = bytes.slice(start, end);
    parts.push(part);
    outputLength += part.length;
  };

  while (offset < bytes.length) {
    const markerStart = offset;
    if (bytes[offset] !== 0xff) {
      append(offset, bytes.length);
      break;
    }

    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) throw new Error('JPEG marker truncated');

    const marker = bytes[offset];
    offset += 1;
    if (marker === 0x00 || marker === JPEG_SOS) {
      append(markerStart, bytes.length);
      break;
    }

    if (isStandaloneMarker(marker)) {
      append(markerStart, offset);
      if (marker === JPEG_EOI) break;
      continue;
    }

    if (offset + 2 > bytes.length) throw new Error('JPEG segment length truncated');
    const length = (bytes[offset] << 8) + bytes[offset + 1];
    if (length < 2) throw new Error('JPEG segment has invalid length');
    const segmentEnd = offset + length;
    if (segmentEnd > bytes.length) throw new Error('JPEG segment exceeds file size');

    if (REMOVABLE_MARKERS.has(marker)) {
      const byteLength = segmentEnd - markerStart;
      removedBytes += byteLength;
      removedSegments.push({
        marker: `0x${marker.toString(16)}`,
        name: markerName(marker),
        bytes: byteLength,
      });
    } else {
      append(markerStart, segmentEnd);
    }
    offset = segmentEnd;
  }

  const output = new Uint8Array(outputLength);
  let outputOffset = 0;
  parts.forEach((part) => {
    output.set(part, outputOffset);
    outputOffset += part.length;
  });

  return {
    arrayBuffer: output.buffer,
    metadataRemoved: removedSegments.length > 0,
    removedBytes,
    removedSegments,
  };
}
