import { isValidCoordinate } from './geoDistance';

const escapeXml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

const escapeHtml = escapeXml;

const csvEscape = (value) => {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
};

const buildPointName = (point, index) => {
  if (point.indexFromOcr) return String(point.indexFromOcr);
  if (point.fileName) return point.fileName;
  return `Точка ${index + 1}`;
};

const buildDescriptionLines = (point) => [
  `Файл: ${point.fileName || ''}`,
  `Координаты: ${point.latitude}, ${point.longitude}`,
  `Ссылка на фото: ${point.imageUrl || ''}`,
  `Описание: ${point.description || ''}`,
  `Источник координат: ${point.gpsSource || ''}`,
].filter((line) => !line.endsWith(': '));

export function getExportablePoints(photos) {
  return photos
    .filter((photo) => isValidCoordinate(photo.latitude, photo.longitude))
    .map((photo, index) => {
      const imageUrl = photo.imageUrl || photo.uploadedUrl || '';

      return {
        id: photo.id,
        index: photo.indexFromOcr || photo.displayIndex || String(index + 1),
        name: buildPointName({ ...photo, imageUrl }, index),
        fileName: photo.fileName || photo.originalName || '',
        originalName: photo.originalName || photo.fileName || '',
        uploadFilename: photo.uploadFilename || '',
        latitude: Number(photo.latitude),
        longitude: Number(photo.longitude),
        gpsSource: photo.gpsSource || '',
        imageUrl,
        url: imageUrl,
        description: photo.description || '',
        distanceStatus: photo.distanceStatus || '',
        warnings: [
          ...(photo.gpsWarnings || []),
          ...(photo.distanceWarnings || []),
        ],
      };
    });
}

export function buildGpx(points) {
  const waypoints = points.map((point) => {
    const description = buildDescriptionLines(point).join('\n');

    return `  <wpt lat="${escapeXml(point.latitude)}" lon="${escapeXml(point.longitude)}">
    <name>${escapeXml(point.name)}</name>
    <desc>${escapeXml(description)}</desc>
    ${point.imageUrl ? `<link href="${escapeXml(point.imageUrl)}" />` : ''}
  </wpt>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GPS Checker" xmlns="http://www.topografix.com/GPX/1/1">
${waypoints}
</gpx>
`;
}

const buildKmlDescription = (point) => {
  const rows = [
    ['Файл', point.fileName],
    ['Ссылка на фото', point.imageUrl],
    ['Описание', point.description],
    ['Источник координат', point.gpsSource],
  ].filter(([, value]) => String(value || '').trim());

  const html = rows.map(([label, value]) => {
    if (label === 'Ссылка на фото') {
      return `<p><strong>${escapeHtml(label)}:</strong> <a href="${escapeHtml(value)}">${escapeHtml(value)}</a></p>`;
    }

    return `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`;
  }).join('');

  return html.replaceAll(']]>', ']]&gt;');
};

export function buildKml(points) {
  const placemarks = points.map((point) => `    <Placemark>
      <name>${escapeXml(point.name)}</name>
      <description><![CDATA[${buildKmlDescription(point)}]]></description>
      <Point><coordinates>${escapeXml(point.longitude)},${escapeXml(point.latitude)},0</coordinates></Point>
    </Placemark>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>GPS Checker points</name>
${placemarks}
  </Document>
</kml>
`;
}

export function buildCsv(points) {
  const rows = [
    ['id', 'index', 'fileName', 'latitude', 'longitude', 'gpsSource', 'imageUrl', 'description', 'distanceStatus', 'warnings'],
    ...points.map((point) => [
      point.id,
      point.index,
      point.fileName,
      point.latitude,
      point.longitude,
      point.gpsSource,
      point.imageUrl,
      point.description,
      point.distanceStatus,
      (point.warnings || []).join(' | '),
    ]),
  ];

  return rows.map((row) => row.map(csvEscape).join(',')).join('\n');
}

export function buildDistanceReportCsv(violations) {
  const rows = [
    ['pointA', 'pointB', 'distanceMeters', 'thresholdMeters', 'pointAFileName', 'pointBFileName'],
    ...violations.map((violation) => [
      violation.pointALabel,
      violation.pointBLabel,
      Number(violation.distanceMeters).toFixed(2),
      violation.thresholdMeters,
      violation.pointAFileName,
      violation.pointBFileName,
    ]),
  ];

  return rows.map((row) => row.map(csvEscape).join(',')).join('\n');
}

export function downloadTextFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
