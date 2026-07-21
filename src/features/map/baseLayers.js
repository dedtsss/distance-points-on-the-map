export const MAP_LAYER_STORAGE_KEY = 'gps-checker-map-layer-v1';
export const DEFAULT_MAP_LAYER_ID = 'hybrid';

const EOX_SATELLITE_ATTRIBUTION = [
  '<a href="https://cloudless.eox.at" target="_blank" rel="noreferrer">EOxCloudless 2016</a>',
  '© EOX IT Services GmbH',
  'Contains modified Copernicus Sentinel data 2016',
].join(' · ');

const EOX_OVERLAY_ATTRIBUTION = [
  'Labels © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>',
  'rendering © EOX and MapServer',
].join(' · ');

export const MAP_LAYER_DEFINITIONS = Object.freeze({
  osm: Object.freeze({
    id: 'osm',
    label: 'Схема',
    description: 'OpenStreetMap: дороги, объекты и подписи.',
    layers: Object.freeze([
      Object.freeze({
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        options: Object.freeze({
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>',
        }),
      }),
    ]),
  }),
  satellite: Object.freeze({
    id: 'satellite',
    label: 'Спутник',
    description: 'Открытая облачно-свободная мозаика Sentinel-2 за 2016 год.',
    layers: Object.freeze([
      Object.freeze({
        url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg',
        options: Object.freeze({
          maxNativeZoom: 14,
          maxZoom: 19,
          attribution: EOX_SATELLITE_ATTRIBUTION,
        }),
      }),
    ]),
  }),
  hybrid: Object.freeze({
    id: 'hybrid',
    label: 'Гибрид',
    description: 'Спутниковая мозаика с границами, дорогами и подписями.',
    layers: Object.freeze([
      Object.freeze({
        url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg',
        options: Object.freeze({
          maxNativeZoom: 14,
          maxZoom: 19,
          attribution: EOX_SATELLITE_ATTRIBUTION,
        }),
      }),
      Object.freeze({
        url: 'https://tiles.maps.eox.at/wmts/1.0.0/overlay_bright_3857/default/g/{z}/{y}/{x}.jpg',
        options: Object.freeze({
          maxNativeZoom: 18,
          maxZoom: 19,
          attribution: EOX_OVERLAY_ATTRIBUTION,
        }),
      }),
    ]),
  }),
});

export const MAP_LAYER_OPTIONS = Object.freeze(
  Object.values(MAP_LAYER_DEFINITIONS).map(({ id, label, description }) => Object.freeze({ id, label, description })),
);

export function normalizeMapLayerId(value) {
  const candidate = String(value || '').trim().toLowerCase();
  return MAP_LAYER_DEFINITIONS[candidate] ? candidate : DEFAULT_MAP_LAYER_ID;
}

export function loadMapLayerId(storage = globalThis.localStorage) {
  try {
    return normalizeMapLayerId(storage?.getItem(MAP_LAYER_STORAGE_KEY));
  } catch {
    return DEFAULT_MAP_LAYER_ID;
  }
}

export function saveMapLayerId(value, storage = globalThis.localStorage) {
  const normalized = normalizeMapLayerId(value);
  try {
    storage?.setItem(MAP_LAYER_STORAGE_KEY, normalized);
  } catch {
    // Map layer preference must never block rendering the map.
  }
  return normalized;
}

export function getMapLayerDefinition(value) {
  return MAP_LAYER_DEFINITIONS[normalizeMapLayerId(value)];
}
