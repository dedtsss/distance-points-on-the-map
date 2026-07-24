import assert from 'node:assert/strict';
import {
  buildCoordinateExport,
  buildGeoUri,
  buildOpenStreetMapPointUrl,
  buildPointShareText,
  getExportablePoints,
  sanitizeExportFileName,
} from '../src/features/export/coordinateExport.js';

const photos = [
  {
    id: 'a',
    number: 1,
    fileName: 'IMG_0001.jpg',
    internalName: 'index-12345',
    pointLabel: '12345',
    indexFromOcr: '12345',
    coordinateQuality: 'confident',
    coordinates: { latitude: 64.12345678, longitude: 30.87654321 },
  },
  {
    id: 'b',
    number: 2,
    fileName: 'IMG_0002.jpg',
    pointLabel: 'Фото 2',
    coordinateQuality: 'manual',
    coordinates: { latitude: '64.2', longitude: '30.3' },
  },
  {
    id: 'missing',
    number: 3,
    fileName: 'IMG_0003.jpg',
    coordinates: null,
  },
  {
    id: 'invalid',
    number: 4,
    fileName: 'IMG_0004.jpg',
    coordinates: { latitude: 100, longitude: 30 },
  },
];

assert.equal(getExportablePoints(photos).length, 2);
assert.equal(sanitizeExportFileName(' Сессия: Карелия / 24.07 '), 'Сессия-Карелия-24.07');

const gpx = buildCoordinateExport(photos, 'gpx', { title: 'Тестовая сессия', fileNameBase: 'points' });
assert.equal(gpx.pointCount, 2);
assert.equal(gpx.fileName, 'points.gpx');
assert.match(gpx.content, /<gpx version="1.1"/);
assert.match(gpx.content, /<wpt lat="64.12345678" lon="30.87654321">/);
assert.match(gpx.content, /<name>12345<\/name>/);
assert.doesNotMatch(gpx.content, /IMG_0003/);

const kml = buildCoordinateExport(photos, 'kml', { title: 'Тестовая сессия' });
assert.match(kml.content, /<coordinates>30.87654321,64.12345678,0<\/coordinates>/);
assert.match(kml.content, /<Placemark>/);

const geojson = buildCoordinateExport(photos, 'geojson', { title: 'Тестовая сессия' });
const parsed = JSON.parse(geojson.content);
assert.equal(parsed.type, 'FeatureCollection');
assert.equal(parsed.features.length, 2);
assert.deepEqual(parsed.features[0].geometry.coordinates, [30.87654321, 64.12345678]);
assert.equal(parsed.features[0].properties.index, '12345');

const geoUri = buildGeoUri(photos[0]);
assert.match(geoUri, /^geo:64\.12345678,30\.87654321\?q=/);
assert.match(geoUri, /12345/);

const osmUrl = buildOpenStreetMapPointUrl(photos[0]);
assert.match(osmUrl, /openstreetmap\.org\/\?mlat=64\.12345678&mlon=30\.87654321/);
assert.match(osmUrl, /#map=18\/64\.12345678\/30\.87654321/);

const shareText = buildPointShareText(photos[0]);
assert.match(shareText, /Координаты: 64\.12345678, 30\.87654321/);
assert.match(shareText, /geo:/);
assert.match(shareText, /OpenStreetMap/i);

assert.throws(() => buildCoordinateExport([photos[2]], 'gpx'), /Нет фотографий/);
assert.throws(() => buildCoordinateExport(photos, 'csv'), /Неподдерживаемый формат/);

console.log('Coordinate export tests passed');
