export const PREFERENCES_KEY = 'darkfoto.settings.v1';
export const DEFAULT_PREFERENCES = Object.freeze({ radiusMeters: 4, minimumDistanceMeters: 25 });
const boundedStep = (value, min, max, step, fallback) => Number.isFinite(value)
  ? Math.round(Math.max(min, Math.min(max, value)) / step) * step : fallback;
export const normalizePreferences = (values = {}) => ({
  radiusMeters: boundedStep(values?.radiusMeters, 0.5, 10, 0.5, 4),
  minimumDistanceMeters: boundedStep(values?.minimumDistanceMeters, 5, 100, 1, 25),
});
export function readPreferences(storage = globalThis.localStorage) {
  try { return normalizePreferences(JSON.parse(storage.getItem(PREFERENCES_KEY) || '{}')); }
  catch { return { ...DEFAULT_PREFERENCES }; }
}
export function savePreferences(values, storage = globalThis.localStorage) {
  const next = normalizePreferences(values);
  storage.setItem(PREFERENCES_KEY, JSON.stringify(next));
  return next;
}
