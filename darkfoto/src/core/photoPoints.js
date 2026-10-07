import { haversineDistanceMeters } from './utils/geoDistance.js';
import { normalizeCoordinates } from './features/gps/coordinateParser.js';

// Separate same-object evidence from the unchanged 25 m Main/Reserve rule.
export const GROUP_DEFAULTS = Object.freeze({ radiusMeters: 10, maxSpanMs: 120_000,
  tightRadiusMeters: 3, strongSpanMs: 30_000, nearIndexGap: 2, largeIndexGap: 10 });
export const recognizedIndex = (photo) => photo.indexStatus === 'found'
  && /^\d{4,5}$/.test(String(photo.indexFromOcr || ''));
const validCoordinates = (photo) => photo.coordinateQuality === 'confident'
  && normalizeCoordinates(photo.coordinates?.latitude, photo.coordinates?.longitude);
const trustedTime = (photo) => ['exif', 'filename'].includes(photo.captureTimeSource)
  && Number.isFinite(photo.captureTimeMs) ? photo.captureTimeMs : null;
const byOrder = (a, b) => a.number - b.number || String(a.id).localeCompare(String(b.id));

export function makePoint(members) {
  const ordered = [...members].sort(byOrder);
  const valid = ordered.filter(validCoordinates);
  const accurate = valid.filter((photo) => Number.isFinite(photo.accuracyMeters) && photo.accuracyMeters >= 0)
    .sort((a, b) => a.accuracyMeters - b.accuracyMeters || byOrder(a, b));
  const representative = accurate[0] || valid[0] || ordered[0];
  const index = recognizedIndex(representative) ? representative : ordered.find(recognizedIndex);
  return { ...representative,
    id: ordered.length === 1 ? ordered[0].id : `point:${ordered.map((photo) => photo.id).join(':')}`,
    number: ordered[0].number, members: ordered, representativeId: representative.id,
    indexFromOcr: index?.indexFromOcr || representative.indexFromOcr || null,
    indexStatus: index ? 'found' : representative.indexStatus,
    uploadResult: ordered.length === 1 ? ordered[0].uploadResult || { links: [] } : { links: [] },
  };
}

function canJoin(members, candidate, rules) {
  const anchor = members[0];
  const previous = members.at(-1);
  if (!validCoordinates(candidate) || !validCoordinates(anchor)) return false;
  const distance = haversineDistanceMeters(anchor, candidate);
  if (distance === null || distance > rules.radiusMeters) return false;
  // Also remain near the best representative if accuracy changes its position.
  const resulting = makePoint([...members, candidate]);
  if (members.some((photo) => haversineDistanceMeters(photo, resulting) > rules.radiusMeters)) return false;
  const times = [...members, candidate].map(trustedTime);
  const known = times.filter((time) => time !== null);
  const span = known.length ? Math.max(...known) - Math.min(...known) : 0;
  if (span > rules.maxSpanMs) return false;
  const gap = recognizedIndex(previous) && recognizedIndex(candidate)
    ? Math.abs(Number(previous.indexFromOcr) - Number(candidate.indexFromOcr)) : null;
  if (times.some((time) => time === null)) {
    return distance <= rules.tightRadiusMeters && gap !== null && gap <= rules.nearIndexGap;
  }
  if (gap === null) return distance <= rules.tightRadiusMeters && span <= rules.strongSpanMs;
  return gap <= rules.largeIndexGap
    || (distance <= rules.tightRadiusMeters && span <= rules.strongSpanMs);
}

export function groupPhotos(photos, rules = GROUP_DEFAULTS) {
  const groups = [];
  for (const photo of [...photos].sort(byOrder)) {
    const last = groups.at(-1);
    if (last && canJoin(last, photo, rules)) last.push(photo);
    else groups.push([photo]);
  }
  return groups.map(makePoint);
}

export const pointMembers = (point) => point.members || [point];
export const sourcePhotoCount = (points) => points.reduce((count, point) => count + pointMembers(point).length, 0);
export const hasPublishedPoints = (points) => points.some((point) => point.uploadResult?.links?.length);

export function splitPoint(points, id) {
  if (hasPublishedPoints(points)) return points;
  return points.flatMap((point) => point.id === id ? pointMembers(point).map((photo) => makePoint([photo])) : [point]);
}

export function mergePoint(points, id, direction) {
  if (hasPublishedPoints(points) || ![-1, 1].includes(direction)) return points;
  const position = points.findIndex((point) => point.id === id);
  const neighbor = position + direction;
  if (position < 0 || neighbor < 0 || neighbor >= points.length) return points;
  const start = Math.min(position, neighbor);
  return [...points.slice(0, start), makePoint([...pointMembers(points[start]), ...pointMembers(points[start + 1])]),
    ...points.slice(start + 2)];
}
