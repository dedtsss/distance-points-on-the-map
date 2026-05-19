const escapeXml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

const csvEscape = (value) => {
  const text = String(value ?? '');
  if (/[",\n\r;]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
};

export function getExportablePoints(photos) {
  return photos
    .filter((photo) => photo.gpsStatus === 'found' && photo.coordinates)
    .map((photo) => ({
      number: photo.number,
      name: `Фото №${photo.number}`,
      originalName: photo.originalName,
      uploadFilename: photo.uploadFilename,
      latitude: photo.coordinates.latitude,
      longitude: photo.coordinates.longitude,
      url: photo.uploadedUrl || '',
    }));
}

export function buildGpx(points) {
  const waypoints = points.map((point) => `  <wpt lat="${point.latitude}" lon="${point.longitude}">
    <name>${escapeXml(point.name)}</name>
    <desc>${escapeXml([point.originalName, point.url].filter(Boolean).join(' | '))}</desc>
    ${point.url ? `<link href="${escapeXml(point.url)}" />` : ''}
  </wpt>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GPS Checker" xmlns="http://www.topografix.com/GPX/1/1">
${waypoints}
</gpx>
`;
}

export function buildKml(points) {
  const placemarks = points.map((point) => `    <Placemark>
      <name>${escapeXml(point.name)}</name>
      <description>${escapeXml([point.originalName, point.url].filter(Boolean).join(' | '))}</description>
      <Point><coordinates>${point.longitude},${point.latitude},0</coordinates></Point>
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
    ['number', 'name', 'original_filename', 'upload_filename', 'latitude', 'longitude', 'photo_url'],
    ...points.map((point) => [
      point.number,
      point.name,
      point.originalName,
      point.uploadFilename,
      point.latitude,
      point.longitude,
      point.url,
    ]),
  ];

  return rows.map((row) => row.map(csvEscape).join(';')).join('\n');
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
