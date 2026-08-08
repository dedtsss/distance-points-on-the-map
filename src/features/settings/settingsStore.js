export const CRM_SETTINGS_KEY = 'dark-cat-crm-settings-v1';

export const DEFAULT_CRM_SETTINGS = Object.freeze({
  metadataCleanup: true,
  renameFiles: true,
  metadataFirst: true,
  mapLayerId: 'hybrid',
  distanceThresholdMeters: 25,
});

export function normalizeCrmSettings(value = {}) {
  return {
    metadataCleanup: value.metadataCleanup !== false,
    renameFiles: value.renameFiles !== false,
    metadataFirst: value.metadataFirst !== false,
    mapLayerId: ['osm', 'satellite', 'hybrid', 'arcgis'].includes(value.mapLayerId)
      ? value.mapLayerId
      : DEFAULT_CRM_SETTINGS.mapLayerId,
    distanceThresholdMeters: Math.max(1, Math.min(1000, Number(value.distanceThresholdMeters) || 25)),
  };
}

export function loadCrmSettings(storage = globalThis.localStorage) {
  try {
    return normalizeCrmSettings(JSON.parse(storage?.getItem(CRM_SETTINGS_KEY) || 'null') || {});
  } catch {
    return { ...DEFAULT_CRM_SETTINGS };
  }
}

export function saveCrmSettings(value, storage = globalThis.localStorage) {
  const normalized = normalizeCrmSettings(value);
  try {
    storage?.setItem(CRM_SETTINGS_KEY, JSON.stringify(normalized));
  } catch {
    // A browser quota error must never block photo processing.
  }
  return normalized;
}
