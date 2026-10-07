// EXIF/filename dates without timezone use one UTC wall-clock convention for comparisons.
function wallClock(parts) {
  const [year, month, day, hour, minute, second] = parts.map(Number);
  const ms = Date.UTC(year, month - 1, day, hour, minute, second);
  const date = new Date(ms);
  return year >= 1970 && year <= 2199 && date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    && date.getUTCHours() === hour && date.getUTCMinutes() === minute && date.getUTCSeconds() === second ? ms : null;
}

export function exifTime(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  const match = String(value || '').match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  return match ? wallClock(match.slice(1)) : null;
}

export function captureTime(file, exif = {}) {
  for (const value of [exif.DateTimeOriginal, exif.CreateDate]) {
    const ms = exifTime(value);
    if (ms !== null) return { captureTimeMs: ms, captureTimeSource: 'exif' };
  }
  const match = String(file.name || '').match(/^(?:IMG|VID|PXL)_(\d{4})(\d{2})(\d{2})[_-](\d{2})(\d{2})(\d{2})(?:[._-].*)?\.[a-z0-9]+$/i);
  const ms = match ? wallClock(match.slice(1, 7)) : null;
  if (ms !== null) return { captureTimeMs: ms, captureTimeSource: 'filename' };
  return Number.isFinite(file.lastModified) && file.lastModified > 0
    ? { captureTimeMs: file.lastModified, captureTimeSource: 'lastModified' }
    : { captureTimeMs: null, captureTimeSource: 'missing' };
}

export function parseAccuracy(text) {
  const match = String(text || '').match(/±\s*(\d+(?:[.,]\d+)?)\s*(?:m|м)(?![a-zа-я])/i);
  const value = match ? Number(match[1].replace(',', '.')) : NaN;
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function availableOcrAccuracy(ocr) {
  // Read only the successful text/candidate already returned by recognition.
  if (Number.isFinite(ocr?.accuracyMeters) && ocr.accuracyMeters >= 0) return ocr.accuracyMeters;
  return parseAccuracy(ocr?.rawText || ocr?.text || ocr?.chosenCandidate?.rawText);
}
