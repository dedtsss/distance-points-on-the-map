export const EXPORT_DESCRIPTION_KEY = 'gps-checker-export-description-v1';

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
