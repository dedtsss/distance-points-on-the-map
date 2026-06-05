import exifr from 'exifr';

const JPEG_SOI = 0xd8;
const JPEG_SOS = 0xda;
const JPEG_EOI = 0xd9;

const REMOVABLE_JPEG_MARKERS = new Set([
  0xe1, // APP1: EXIF/XMP
  0xe2, // APP2: ICC profile
  0xed, // APP13: IPTC/Photoshop
  0xfe, // COM: comments
]);

const METADATA_KEY_PATTERN = /(gps|latitude|longitude|datetime|createdate|modifydate|make|model|lens|software|artist|copyright|serial|owner|exif|xmp|iptc|icc|thumbnail)/i;

const randomHex = (bytes = 8) => {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('');
};

const loadImage = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const image = new Image();

  image.onload = () => {
    URL.revokeObjectURL(url);
    resolve(image);
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error('Не удалось загрузить изображение для очистки'));
  };
  image.src = url;
});

const canvasToBlob = (canvas) => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (blob) {
      resolve(blob);
    } else {
      reject(new Error('Canvas не смог создать очищенный файл'));
    }
  }, 'image/jpeg', 0.92);
});

const normalizeFilename = (filename) => {
  const value = String(filename || '').trim();
  if (!value) return `f_${randomHex(8)}.jpg`;

  const safe = value
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return `${safe || `f_${randomHex(8)}`}.jpg`;
};

const markerName = (marker, payload = new Uint8Array()) => {
  if (marker === 0xe1) {
    const signature = new TextDecoder('latin1').decode(payload.slice(0, 40));
    if (signature.startsWith('Exif')) return 'APP1 EXIF';
    if (signature.includes('xmp')) return 'APP1 XMP';
    return 'APP1 metadata';
  }

  if (marker === 0xe2) return 'APP2 ICC profile';
  if (marker === 0xed) return 'APP13 IPTC/Photoshop';
  if (marker === 0xfe) return 'COM comment';
  return `marker 0x${marker.toString(16)}`;
};

const isStandaloneMarker = (marker) => (
  marker === 0x01
  || marker === JPEG_EOI
  || (marker >= 0xd0 && marker <= 0xd7)
);

const appendPart = (parts, bytes, start, end) => {
  if (end <= start) return 0;
  const part = bytes.slice(start, end);
  parts.push(part);
  return part.length;
};

const joinParts = (parts, totalLength) => {
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }

  return output.buffer;
};

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

  if (!isJpegArrayBuffer(arrayBuffer)) {
    throw new Error('Файл не является JPEG');
  }

  const parts = [bytes.slice(0, 2)];
  let totalLength = 2;
  let offset = 2;
  let removedBytes = 0;
  const removedSegments = [];

  while (offset < bytes.length) {
    const markerStart = offset;

    if (bytes[offset] !== 0xff) {
      totalLength += appendPart(parts, bytes, offset, bytes.length);
      break;
    }

    while (offset < bytes.length && bytes[offset] === 0xff) {
      offset += 1;
    }

    if (offset >= bytes.length) {
      throw new Error('JPEG marker truncated');
    }

    const marker = bytes[offset];
    offset += 1;

    if (marker === 0x00) {
      totalLength += appendPart(parts, bytes, markerStart, bytes.length);
      break;
    }

    if (marker === JPEG_SOS) {
      totalLength += appendPart(parts, bytes, markerStart, bytes.length);
      break;
    }

    if (isStandaloneMarker(marker)) {
      totalLength += appendPart(parts, bytes, markerStart, offset);
      if (marker === JPEG_EOI) break;
      continue;
    }

    if (offset + 2 > bytes.length) {
      throw new Error('JPEG segment length truncated');
    }

    const length = (bytes[offset] << 8) + bytes[offset + 1];
    if (length < 2) {
      throw new Error('JPEG segment has invalid length');
    }

    const segmentEnd = offset + length;
    if (segmentEnd > bytes.length) {
      throw new Error('JPEG segment exceeds file size');
    }

    if (REMOVABLE_JPEG_MARKERS.has(marker)) {
      const payload = bytes.subarray(offset + 2, segmentEnd);
      const byteLength = segmentEnd - markerStart;
      removedBytes += byteLength;
      removedSegments.push({
        marker: `0x${marker.toString(16)}`,
        name: markerName(marker, payload),
        bytes: byteLength,
      });
    } else {
      totalLength += appendPart(parts, bytes, markerStart, segmentEnd);
    }

    offset = segmentEnd;
  }

  return {
    arrayBuffer: joinParts(parts, totalLength),
    metadataRemoved: removedSegments.length > 0,
    removedBytes,
    removedSegments,
  };
}

export async function verifyCleanedMetadata(file) {
  try {
    const parsed = await exifr.parse(file, {
      tiff: true,
      ifd0: true,
      exif: true,
      gps: true,
      xmp: true,
      iptc: true,
      icc: true,
      jfif: false,
      ihdr: false,
      translateValues: false,
      reviveValues: true,
      mergeOutput: true,
    });
    const remainingKeys = Object.keys(parsed || {}).sort();
    const hasGps = remainingKeys.some((key) => /^(gps|latitude|longitude)/i.test(key));
    const hasExif = remainingKeys.some((key) => METADATA_KEY_PATTERN.test(key));

    return {
      checked: true,
      hasGps,
      hasExif,
      remainingKeys,
    };
  } catch (error) {
    return {
      checked: false,
      hasGps: false,
      hasExif: false,
      remainingKeys: [],
      error: error instanceof Error ? error.message : 'metadata verification failed',
    };
  }
}

const isVerificationSafe = (verification) => (
  verification?.checked === true
  && verification.hasGps === false
  && verification.hasExif === false
);

const verificationWarnings = (verification) => {
  if (!verification?.checked) {
    return [`Проверка метаданных не выполнена: ${verification?.error || 'unknown error'}`];
  }

  const warnings = [];
  if (verification.hasGps) {
    warnings.push('После очистки GPS metadata все еще присутствует');
  }
  if (verification.hasExif) {
    const keys = verification.remainingKeys.slice(0, 12).join(', ');
    warnings.push(`После очистки остались metadata поля: ${keys || 'unknown'}`);
  }
  return warnings;
};

const makeCleanResult = ({
  ok,
  file,
  filename,
  warnings,
  method,
  metadataRemoved,
  verification,
}) => ({
  ok,
  file,
  filename,
  warnings,
  method,
  metadataRemoved,
  verification,
});

const cleanWithCanvas = async (file, orientation, filename, warnings) => {
  const image = await loadImage(file);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas 2D недоступен');
  }

  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const normalizedOrientation = [1, 3, 6, 8].includes(orientation) ? orientation : 1;

  if (normalizedOrientation !== orientation) {
    warnings.push(`Ориентация ${orientation} не поддержана, использован обычный режим`);
  }

  if (normalizedOrientation === 6 || normalizedOrientation === 8) {
    canvas.width = height;
    canvas.height = width;
  } else {
    canvas.width = width;
    canvas.height = height;
  }

  if (normalizedOrientation === 3) {
    context.translate(canvas.width, canvas.height);
    context.rotate(Math.PI);
  } else if (normalizedOrientation === 6) {
    context.translate(canvas.width, 0);
    context.rotate(Math.PI / 2);
  } else if (normalizedOrientation === 8) {
    context.translate(0, canvas.height);
    context.rotate(-Math.PI / 2);
  }

  context.drawImage(image, 0, 0, width, height);
  const blob = await canvasToBlob(canvas);
  return new File([blob], filename, { type: 'image/jpeg' });
};

const finalizeCanvasFallback = async (file, orientation, filename, warnings) => {
  try {
    const cleanedFile = await cleanWithCanvas(file, orientation, filename, warnings);
    const verification = await verifyCleanedMetadata(cleanedFile);
    const safe = isVerificationSafe(verification);
    const nextWarnings = [...warnings, ...verificationWarnings(verification)];

    if (verification.checked && !safe) {
      return makeCleanResult({
        ok: false,
        file: null,
        filename,
        warnings: nextWarnings,
        method: 'failed',
        metadataRemoved: false,
        verification,
      });
    }

    return makeCleanResult({
      ok: true,
      file: cleanedFile,
      filename,
      warnings: nextWarnings,
      method: 'canvas-fallback',
      metadataRemoved: safe || !verification.checked,
      verification,
    });
  } catch (error) {
    return makeCleanResult({
      ok: false,
      file: null,
      filename,
      warnings: [
        ...warnings,
        error instanceof Error ? error.message : 'Ошибка очистки изображения',
      ],
      method: 'failed',
      metadataRemoved: false,
      verification: {
        checked: false,
        hasGps: false,
        hasExif: false,
        remainingKeys: [],
        error: 'cleanup failed before verification',
      },
    });
  }
};

export async function cleanImageForUpload(file, orientation = 1, preferredFilename = '') {
  const filename = normalizeFilename(preferredFilename);
  const warnings = [];
  const normalizedOrientation = [1, 3, 6, 8].includes(orientation) ? orientation : 1;

  if (isJpegFile(file) && normalizedOrientation === 1) {
    try {
      const stripped = stripJpegMetadataFromArrayBuffer(await file.arrayBuffer());
      const cleanedFile = new File([stripped.arrayBuffer], filename, { type: 'image/jpeg' });
      const verification = await verifyCleanedMetadata(cleanedFile);
      const safe = isVerificationSafe(verification);

      if (!verification.checked || safe) {
        return makeCleanResult({
          ok: true,
          file: cleanedFile,
          filename,
          warnings: [
            ...warnings,
            ...verificationWarnings(verification),
          ],
          method: 'binary-jpeg-strip',
          metadataRemoved: safe || stripped.metadataRemoved || !verification.checked,
          verification: {
            ...verification,
            removedSegments: stripped.removedSegments,
            removedBytes: stripped.removedBytes,
          },
        });
      }

      warnings.push(...verificationWarnings(verification));
      warnings.push('Бинарная очистка не прошла проверку, использован Canvas fallback');
    } catch (error) {
      warnings.push(`Бинарная очистка JPEG не выполнена: ${error instanceof Error ? error.message : 'unknown error'}`);
      warnings.push('Использован Canvas fallback');
    }
  } else if (isJpegFile(file) && normalizedOrientation !== 1) {
    warnings.push('У JPEG есть EXIF Orientation, для сохранения поворота использован Canvas fallback');
  } else {
    warnings.push('Бинарная очистка доступна только для JPEG, использован Canvas fallback');
  }

  return finalizeCanvasFallback(file, orientation, filename, warnings);
}
