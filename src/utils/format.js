export const formatCoordinates = (coordinates) => (
  coordinates
    ? `${coordinates.latitude.toFixed(6)}, ${coordinates.longitude.toFixed(6)}`
    : 'нет координат'
);

export const formatFileSize = (bytes) => {
  const value = Number(bytes) || 0;
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} КБ`;
  return `${(value / (1024 * 1024)).toFixed(1)} МБ`;
};
