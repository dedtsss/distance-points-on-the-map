const formatCoordinateValue = (value, precision) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '';
  if (Number.isInteger(precision) && precision >= 0 && precision <= 10) {
    return numeric.toFixed(precision);
  }
  return numeric.toFixed(6);
};

export const formatCoordinates = (coordinates, options = {}) => {
  if (!coordinates) return 'нет координат';
  const sourceText = options.coordinateText;
  if (sourceText?.latitude && sourceText?.longitude) {
    return `${sourceText.latitude}, ${sourceText.longitude}`;
  }
  return [
    formatCoordinateValue(coordinates.latitude, options.coordinatePrecision?.latitude),
    formatCoordinateValue(coordinates.longitude, options.coordinatePrecision?.longitude),
  ].join(', ');
};

export const formatFileSize = (bytes) => {
  const value = Number(bytes) || 0;
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} КБ`;
  return `${(value / (1024 * 1024)).toFixed(1)} МБ`;
};
