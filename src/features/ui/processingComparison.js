const thumbnail = (label, background, foreground = '#ffffff') => `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="104" viewBox="0 0 160 104"><rect width="160" height="104" fill="${background}"/><path d="M0 82 38 50l25 18 24-28 73 54H0Z" fill="${foreground}" opacity=".32"/><circle cx="116" cy="30" r="14" fill="${foreground}" opacity=".72"/><text x="12" y="94" fill="${foreground}" font-family="Arial" font-size="13" font-weight="700">${label}</text></svg>`)}`;

export function processingComparisonFromLocation() {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const value = params.get('comparison');
  return value === 'light' || value === 'dark' ? value : null;
}

export function createProcessingComparisonPhotos() {
  const shared = {
    stableFile: { name: 'comparison-photo.jpg', type: 'image/jpeg' },
    cleanupStatus: 'idle',
    uploadStatus: 'idle',
    workStatus: 'active',
    gpsStatus: 'done',
    ocrStatus: 'confident',
    coordinateQuality: 'high',
    manualCoordinates: false,
  };
  return [
    { ...shared, id: 'comparison-01', number: 1, fileName: 'IMG_20260821_1420.jpg', displayFileName: 'IMG_20260821_1420.jpg', indexFromOcr: 'A-104', coordinates: { latitude: 55.7558, longitude: 37.6173 }, thumbnailDataUrl: thumbnail('A-104', '#355b78'), gpsStatus: 'done', ocrStatus: 'confident' },
    { ...shared, id: 'comparison-02', number: 2, fileName: 'IMG_20260821_1424.jpg', displayFileName: 'IMG_20260821_1424.jpg', indexFromOcr: 'A-105', coordinates: { latitude: 55.7512, longitude: 37.6184 }, coordinateQuality: 'low_precision', thumbnailDataUrl: thumbnail('A-105', '#8a6426'), gpsWarnings: ['Точность координат ниже порога'] },
    { ...shared, id: 'comparison-03', number: 3, fileName: 'IMG_20260821_1427.jpg', displayFileName: 'IMG_20260821_1427.jpg', indexFromOcr: '', coordinates: null, gpsStatus: 'missing', ocrStatus: 'failed', userError: 'Координаты не найдены автоматически.', thumbnailDataUrl: thumbnail('ПРОВЕРКА', '#71333b') },
    { ...shared, id: 'comparison-04', number: 4, fileName: 'IMG_20260821_1431.jpg', displayFileName: 'IMG_20260821_1431.jpg', indexFromOcr: 'A-107', coordinates: { latitude: 55.7521, longitude: 37.6201 }, thumbnailDataUrl: thumbnail('A-107', '#3a7662') },
  ];
}
