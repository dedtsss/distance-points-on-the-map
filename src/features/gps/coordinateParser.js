import { isValidCoordinate, isZeroZeroCoordinate } from '../../utils/geoDistance.js';

export function normalizeCoordinates(latitude, longitude) {
  const lat = Number(String(latitude).trim().replace(',', '.'));
  const lon = Number(String(longitude).trim().replace(',', '.'));
  if (!isValidCoordinate(lat, lon) || isZeroZeroCoordinate(lat, lon)) return null;
  return { latitude: lat, longitude: lon };
}
