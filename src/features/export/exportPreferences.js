export const EXPORT_DESCRIPTION_KEY = 'gps-checker-export-description-v1';
export const SESSION_COLOR_KEY = 'gps-checker-session-color-v1';
export const SESSION_PACKING_KEY = 'gps-checker-session-packing-v1';

export const SESSION_COLOR_SUGGESTIONS = Object.freeze([
  'Красный',
  'Синий',
  'Жёлтый',
  'Зелёный',
  'Оранжевый',
  'Белый',
  'Чёрный',
  'Серый',
  'Коричневый',
  'Фиолетовый',
  'Розовый',
  'Голубой',
]);

export const normalizeExportDescription = (value) => String(value || '')
  .replace(/\r\n?/g, '\n')
  .slice(0, 4000);

export const normalizeSessionColor = (value) => String(value || '')
  .trim()
  .replace(/\s+/g, ' ')
  .slice(0, 80);

export const normalizeSessionPacking = (value) => String(value || '')
  .trim()
  .replace(/\s+/g, ' ')
  .slice(0, 120);

export const photoSessionSignature = (photos = []) => (photos || [])
  .map((photo, index) => String(photo?.id || photo?.photoId || `${photo?.number || index + 1}:${photo?.fileName || ''}`))
  .join('|');

const signatureIds = (signature) => String(signature || '').split('|').filter(Boolean);
const isSameOrReducedSession = (currentSignature, savedSignature) => {
  if (currentSignature === savedSignature) return true;
  const currentIds = signatureIds(currentSignature);
  const savedIds = signatureIds(savedSignature);
  if (currentIds.length === 0 || savedIds.length === 0) return false;
  return currentIds.every((id) => savedIds.includes(id))
    || savedIds.every((id) => currentIds.includes(id));
};

export function loadExportDescription(storage = globalThis.localStorage) {
  try {
    return normalizeExportDescription(storage?.getItem(EXPORT_DESCRIPTION_KEY) || '');
  } catch {
    return '';
  }
}

export function saveExportDescription(value, storage = globalThis.localStorage) {
  const normalized = normalizeExportDescription(value);
  try {
    if (normalized) storage?.setItem(EXPORT_DESCRIPTION_KEY, normalized);
    else storage?.removeItem(EXPORT_DESCRIPTION_KEY);
  } catch {
    // Persistent export text must never break the main photo workflow.
  }
  return normalized;
}

export function loadSessionColor(signature, storage = globalThis.localStorage) {
  if (!signature) return '';
  try {
    const saved = JSON.parse(storage?.getItem(SESSION_COLOR_KEY) || 'null');
    return isSameOrReducedSession(signature, saved?.signature)
      ? normalizeSessionColor(saved.color)
      : '';
  } catch {
    return '';
  }
}

export function saveSessionColor(signature, value, storage = globalThis.localStorage) {
  const color = normalizeSessionColor(value);
  try {
    if (!signature) return color;
    storage?.setItem(SESSION_COLOR_KEY, JSON.stringify({ signature, color }));
  } catch {
    // Session color is optional and must not block export or OCR.
  }
  return color;
}

export function loadSessionPacking(signature, storage = globalThis.localStorage) {
  if (!signature) return '';
  try {
    const saved = JSON.parse(storage?.getItem(SESSION_PACKING_KEY) || 'null');
    return isSameOrReducedSession(signature, saved?.signature)
      ? normalizeSessionPacking(saved.packing)
      : '';
  } catch {
    return '';
  }
}

export function saveSessionPacking(signature, value, storage = globalThis.localStorage) {
  const packing = normalizeSessionPacking(value);
  try {
    if (!signature) return packing;
    storage?.setItem(SESSION_PACKING_KEY, JSON.stringify({ signature, packing }));
  } catch {
    // Session packing is optional and must not block export or OCR.
  }
  return packing;
}
