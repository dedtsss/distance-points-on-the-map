const displayCoordinate = (photo, axis) => {
  const textValue = photo?.coordinateText?.[axis];
  if (String(textValue || '').trim()) return String(textValue).trim();
  const numericValue = photo?.coordinates?.[axis];
  return Number.isFinite(Number(numericValue)) ? String(numericValue) : '';
};

export function formatIndexCoordinateRows(photos = []) {
  return [...(photos || [])]
    .filter(Boolean)
    .sort((left, right) => (Number(left.number) || 0) - (Number(right.number) || 0))
    .map((photo, index) => {
      const number = Number(photo.number) || index + 1;
      const pointIndex = String(photo.indexFromOcr || '').trim() || 'индекс не распознан';
      const latitude = displayCoordinate(photo, 'latitude');
      const longitude = displayCoordinate(photo, 'longitude');
      const coordinates = latitude && longitude
        ? `${latitude}, ${longitude}`
        : 'координаты не найдены';
      return `Фото ${number} | ${pointIndex} | ${coordinates}`;
    })
    .join('\n');
}
