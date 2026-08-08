export const MAP_LAYER_STORAGE_KEY = 'gps-checker-map-layer-v1';
export const DEFAULT_MAP_LAYER_ID = 'hybrid';

const EOX_SATELLITE_ATTRIBUTION = [
  '<a href="https://cloudless.eox.at" target="_blank" rel="noreferrer">EOxCloudless</a>',
  'by EOX IT Services GmbH',
  'Contains modified Copernicus Sentinel data 2025',
].join(' · ');

const EOX_OVERLAY_ATTRIBUTION = [
  'Labels © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>',
  'rendering © EOX and MapServer',
].join(' · ');

const ARCGIS_WORLD_IMAGERY_ATTRIBUTION = [
  'Tiles © <a href="https://www.esri.com/" target="_blank" rel="noreferrer">Esri</a>',
  'Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community',
].join(' · ');

const EOX_SATELLITE_2025_URL = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg';
const ARCGIS_WORLD_IMAGERY_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

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
    label: 'Спутник 2025',
    description: 'Облачно-свободная мозаика Sentinel-2 за 2025 год, разрешение 10 м.',
    layers: Object.freeze([
      Object.freeze({
        url: EOX_SATELLITE_2025_URL,
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
    label: 'Гибрид 2025',
    description: 'Спутниковая мозаика 2025 года с границами, дорогами и подписями.',
    layers: Object.freeze([
      Object.freeze({
        url: EOX_SATELLITE_2025_URL,
        options: Object.freeze({
          maxNativeZoom: 14,
          maxZoom: 19,
          attribution: EOX_SATELLITE_ATTRIBUTION,
        }),
      }),
      Object.freeze({
        url: 'https://tiles.maps.eox.at/wmts/1.0.0/overlay_bright_3857/default/g/{z}/{y}/{x}.png',
        options: Object.freeze({
          maxNativeZoom: 18,
          maxZoom: 19,
          attribution: EOX_OVERLAY_ATTRIBUTION,
        }),
      }),
    ]),
  }),
  arcgis: Object.freeze({
    id: 'arcgis',
    label: 'ArcGIS Спутник (тест)',
    description: 'Высокодетальные снимки Esri World Imagery без API-ключа для сравнения качества.',
    layers: Object.freeze([
      Object.freeze({
        url: ARCGIS_WORLD_IMAGERY_URL,
        options: Object.freeze({
          maxZoom: 20,
          attribution: ARCGIS_WORLD_IMAGERY_ATTRIBUTION,
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
