export const RECENT_FIELDS = ['session', 'color', 'packing', 'comment'];
const key = (field) => {
  if (!RECENT_FIELDS.includes(field)) throw new Error('Unknown recent field');
  return `darkcat-photo.recent.${field}`;
};
export function readRecentValues(field, storage = localStorage) {
  const raw = JSON.parse(storage.getItem(key(field)) || '[]');
  return Array.isArray(raw) ? [...new Set(raw.filter((value) => typeof value === 'string')
    .map((value) => value.trim()).filter(Boolean))].slice(0, 10) : [];
}
export function rememberValue(field, value, storage = localStorage) {
  const clean = String(value || '').trim();
  const current = readRecentValues(field, storage);
  if (!clean) return current;
  const values = [clean, ...current.filter((item) => item !== clean)].slice(0, 10);
  storage.setItem(key(field), JSON.stringify(values));
  return values;
}
export function forgetValue(field, value, storage = localStorage) {
  const values = readRecentValues(field, storage).filter((item) => item !== value);
  storage.setItem(key(field), JSON.stringify(values));
  return values;
}
export const matchingValues = (values, query) => values.filter((value) =>
  value.toLocaleLowerCase('ru').includes(String(query || '').trim().toLocaleLowerCase('ru')));
