import { isValidCoordinate, isZeroZeroCoordinate } from '../../utils/geoDistance.js';

export function normalizeCoordinates(latitude, longitude) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!isValidCoordinate(lat, lon) || isZeroZeroCoordinate(lat, lon)) return null;
  return { latitude: lat, longitude: lon };
}
