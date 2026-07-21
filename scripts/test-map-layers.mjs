import assert from 'node:assert/strict';
import {
  DEFAULT_MAP_LAYER_ID,
  MAP_LAYER_DEFINITIONS,
  MAP_LAYER_OPTIONS,
  MAP_LAYER_STORAGE_KEY,
  getMapLayerDefinition,
  loadMapLayerId,
  normalizeMapLayerId,
  saveMapLayerId,
} from '../src/features/map/baseLayers.js';

assert.equal(DEFAULT_MAP_LAYER_ID, 'hybrid');
assert.deepEqual(MAP_LAYER_OPTIONS.map((item) => item.id), ['osm', 'satellite', 'hybrid']);
assert.equal(MAP_LAYER_DEFINITIONS.osm.layers.length, 1);
assert.equal(MAP_LAYER_DEFINITIONS.satellite.layers.length, 1);
assert.equal(MAP_LAYER_DEFINITIONS.hybrid.layers.length, 2);
assert.match(MAP_LAYER_DEFINITIONS.satellite.layers[0].url, /s2cloudless_3857/);
assert.match(MAP_LAYER_DEFINITIONS.hybrid.layers[1].url, /overlay_bright_3857/);
assert.match(MAP_LAYER_DEFINITIONS.satellite.layers[0].options.attribution, /Copernicus Sentinel data 2016/);
assert.equal(normalizeMapLayerId('SATELLITE'), 'satellite');
assert.equal(normalizeMapLayerId('unknown'), 'hybrid');
assert.equal(getMapLayerDefinition('osm').label, 'Схема');

const values = new Map();
const storage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
};

assert.equal(loadMapLayerId(storage), 'hybrid');
assert.equal(saveMapLayerId('satellite', storage), 'satellite');
assert.equal(values.get(MAP_LAYER_STORAGE_KEY), 'satellite');
assert.equal(loadMapLayerId(storage), 'satellite');
assert.equal(saveMapLayerId('invalid', storage), 'hybrid');
assert.equal(loadMapLayerId(storage), 'hybrid');

console.log('Map layer tests passed');
