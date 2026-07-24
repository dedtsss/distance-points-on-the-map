const FORMAT_CONFIG = Object.freeze({
  gpx: Object.freeze({ extension: 'gpx', mimeType: 'application/gpx+xml' }),
  kml: Object.freeze({ extension: 'kml', mimeType: 'application/vnd.google-earth.kml+xml' }),
  geojson: Object.freeze({ extension: 'geojson', mimeType: 'application/geo+json' }),
});

export const COORDINATE_EXPORT_FORMATS = Object.freeze(Object.keys(FORMAT_CONFIG));

const finiteCoordinate = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const formatCoordinate = (value) => Number(value)
  .toFixed(8)
  .replace(/\.?0+$/, '');

const xmlEscape = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

export function sanitizeExportFileName(value, fallback = 'gps-map-points') {
  const normalized = String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 100);
  return normalized || fallback;
}

export function normalizeExportPoint(photo = {}) {
  const latitude = finiteCoordinate(photo.coordinates?.latitude);
  const longitude = finiteCoordinate(photo.coordinates?.longitude);
  if (latitude === null || longitude === null) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;

  const index = String(photo.indexFromOcr || '').trim();
  const number = Number(photo.number) || null;
  const name = String(
    photo.pointLabel
    || index
    || photo.displayFileName
    || photo.internalName
    || photo.fileName
    || (number ? `Фото ${number}` : 'Точка'),
  ).trim();
  const description = [
    photo.fileName ? `Файл: ${photo.fileName}` : '',
    index ? `Индекс: ${index}` : '',
    photo.coordinateQuality ? `Качество координат: ${photo.coordinateQuality}` : '',
  ].filter(Boolean).join('; ');

  return {
    id: String(photo.id || ''),
    latitude,
    longitude,
    name,
    description,
    number,
    index,
    fileName: String(photo.fileName || ''),
    internalName: String(photo.internalName || ''),
    coordinateQuality: String(photo.coordinateQuality || ''),
  };
}

export function getExportablePoints(photos = []) {
  return Array.from(photos || []).map(normalizeExportPoint).filter(Boolean);
}

const buildGpx = (points, title) => `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GPS Checker Map Photo" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata><name>${xmlEscape(title)}</name></metadata>
${points.map((point) => `  <wpt lat="${formatCoordinate(point.latitude)}" lon="${formatCoordinate(point.longitude)}">
    <name>${xmlEscape(point.name)}</name>
    ${point.description ? `<desc>${xmlEscape(point.description)}</desc>` : ''}
    <type>photo</type>
  </wpt>`).join('\n')}
</gpx>
`;

const buildKml = (points, title) => `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${xmlEscape(title)}</name>
${points.map((point) => `    <Placemark>
      <name>${xmlEscape(point.name)}</name>
      ${point.description ? `<description>${xmlEscape(point.description)}</description>` : ''}
      <Point><coordinates>${formatCoordinate(point.longitude)},${formatCoordinate(point.latitude)},0</coordinates></Point>
    </Placemark>`).join('\n')}
  </Document>
</kml>
`;

const buildGeoJson = (points, title) => `${JSON.stringify({
  type: 'FeatureCollection',
  name: title,
  features: points.map((point) => ({
    type: 'Feature',
    properties: {
      name: point.name,
      description: point.description,
      photoNumber: point.number,
      index: point.index || null,
      fileName: point.fileName || null,
      internalName: point.internalName || null,
      coordinateQuality: point.coordinateQuality || null,
    },
    geometry: {
      type: 'Point',
      coordinates: [point.longitude, point.latitude],
    },
  })),
}, null, 2)}\n`;

export function buildCoordinateExport(photos, format = 'gpx', options = {}) {
  const normalizedFormat = String(format || '').toLowerCase();
  const config = FORMAT_CONFIG[normalizedFormat];
  if (!config) throw new Error(`Неподдерживаемый формат экспорта: ${format}`);

  const points = getExportablePoints(photos);
  if (points.length === 0) throw new Error('Нет фотографий с корректными координатами.');

  const title = String(options.title || options.name || 'GPS Map Photo — точки').trim();
  const baseName = sanitizeExportFileName(options.fileNameBase || title);
  let content;
  if (normalizedFormat === 'gpx') content = buildGpx(points, title);
  if (normalizedFormat === 'kml') content = buildKml(points, title);
  if (normalizedFormat === 'geojson') content = buildGeoJson(points, title);

  return {
    format: normalizedFormat,
    content,
    mimeType: config.mimeType,
    extension: config.extension,
    fileName: `${baseName}.${config.extension}`,
    pointCount: points.length,
    points,
  };
}

export function buildOpenStreetMapPointUrl(photo, zoom = 18) {
  const point = normalizeExportPoint(photo);
  if (!point) return '';
  const latitude = formatCoordinate(point.latitude);
  const longitude = formatCoordinate(point.longitude);
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=${Number(zoom) || 18}/${latitude}/${longitude}`;
}

export function buildGeoUri(photo) {
  const point = normalizeExportPoint(photo);
  if (!point) return '';
  const latitude = formatCoordinate(point.latitude);
  const longitude = formatCoordinate(point.longitude);
  return `geo:${latitude},${longitude}?q=${latitude},${longitude}(${encodeURIComponent(point.name)})`;
}

export function buildPointShareText(photo) {
  const point = normalizeExportPoint(photo);
  if (!point) return '';
  return [
    point.name,
    `Координаты: ${formatCoordinate(point.latitude)}, ${formatCoordinate(point.longitude)}`,
    buildGeoUri(photo),
    buildOpenStreetMapPointUrl(photo),
  ].filter(Boolean).join('\n');
}

const copyText = async (value, navigatorObject, documentObject) => {
  if (navigatorObject?.clipboard?.writeText) {
    await navigatorObject.clipboard.writeText(value);
    return;
  }
  if (!documentObject?.createElement || !documentObject?.body) throw new Error('Clipboard API недоступен.');
  const textarea = documentObject.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  documentObject.body.append(textarea);
  textarea.select();
  const copied = documentObject.execCommand?.('copy');
  textarea.remove();
  if (!copied) throw new Error('Clipboard API недоступен.');
};

export function downloadCoordinateExport(exportData, options = {}) {
  const documentObject = options.documentObject || globalThis.document;
  const urlObject = options.urlObject || globalThis.URL;
  if (!documentObject?.createElement || !documentObject?.body || !urlObject?.createObjectURL) {
    throw new Error('Скачивание файлов недоступно в этом браузере.');
  }
  const blob = new Blob([exportData.content], { type: exportData.mimeType });
  const href = urlObject.createObjectURL(blob);
  const anchor = documentObject.createElement('a');
  anchor.href = href;
  anchor.download = exportData.fileName;
  anchor.hidden = true;
  documentObject.body.append(anchor);
  anchor.click();
  anchor.remove();
  globalThis.setTimeout(() => urlObject.revokeObjectURL?.(href), 1000);
  return exportData;
}

const shareCancelled = (error) => error?.name === 'AbortError';

export async function shareCoordinateExport(photos, options = {}) {
  const navigatorObject = options.navigatorObject || globalThis.navigator;
  const documentObject = options.documentObject || globalThis.document;
  const exportData = buildCoordinateExport(photos, options.format || 'gpx', options);
  const file = typeof File === 'function'
    ? new File([exportData.content], exportData.fileName, { type: exportData.mimeType })
    : null;

  if (navigatorObject?.share && file && navigatorObject.canShare?.({ files: [file] })) {
    try {
      await navigatorObject.share({
        title: options.title || 'Координаты GPS Map Photo',
        text: exportData.pointCount === 1 ? buildPointShareText(photos[0]) : `Точек в файле: ${exportData.pointCount}`,
        files: [file],
      });
      return { mode: 'shared-file', exportData };
    } catch (error) {
      if (shareCancelled(error)) throw error;
    }
  }

  if (exportData.pointCount === 1) {
    const text = buildPointShareText(photos[0]);
    const url = buildOpenStreetMapPointUrl(photos[0]);
    if (navigatorObject?.share) {
      try {
        await navigatorObject.share({ title: exportData.points[0].name, text, url });
        return { mode: 'shared-link', exportData };
      } catch (error) {
        if (shareCancelled(error)) throw error;
      }
    }
    await copyText(text, navigatorObject, documentObject);
    return { mode: 'copied', exportData };
  }

  downloadCoordinateExport(exportData, { documentObject });
  return { mode: 'downloaded', exportData };
}
