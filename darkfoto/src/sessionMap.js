import { pointMembers } from './core/photoPoints.js';
import { haversineDistanceMeters } from './core/utils/geoDistance.js';

export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/dark';
export const MAP_LOAD_TIMEOUT_MS = 15000;

// A projection of the live session, not a second point store. Coordinates and
// representative previews change together after every membership operation.
export function sessionMapPoints(rows, derivedById, statusOf, labelOf, previews = {}) {
  return rows.filter((point) => !point.removed && pointMembers(point).length).flatMap((row) => {
    const point = derivedById.get(row.id) || row;
    const { latitude, longitude } = point.coordinates || {};
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
      || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return [];
    const status = statusOf(point);
    return [{ id: point.id, label: labelOf(point), status, latitude, longitude,
      count: pointMembers(point).length, thumbnail: previews[point.representativeId || point.id] || null }];
  });
}

// Find the shortest longitude span, including sessions across the date line.
export function sessionMapBounds(points) {
  if (!points.length) return null;
  const longitudes = points.map((point) => (point.longitude + 360) % 360).sort((a, b) => a - b);
  let gap = -1, start = 0;
  for (let i = 0; i < longitudes.length; i++) {
    const next = longitudes[(i + 1) % longitudes.length] + (i === longitudes.length - 1 ? 360 : 0);
    if (next - longitudes[i] > gap) { gap = next - longitudes[i]; start = (i + 1) % longitudes.length; }
  }
  const west = longitudes[start] > 180 ? longitudes[start] - 360 : longitudes[start];
  const east = west + 360 - gap;
  return [[west, Math.min(...points.map((point) => point.latitude))],
    [east, Math.max(...points.map((point) => point.latitude))]];
}

// Reserve points are close by definition; identical coordinates cannot be
// separated by zoom. The preview lets users select each nearby logical point.
export function nearbyMapPoints(points, selectedId) {
  const selected = points.find((point) => point.id === selectedId);
  if (!selected) return [];
  return points.filter((point) => {
    if (point.latitude === selected.latitude && point.longitude === selected.longitude) return true;
    const distance = haversineDistanceMeters(selected, point);
    return distance !== null && distance <= 25;
  });
}
