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
  if ([...members, candidate].some((photo) => haversineDistanceMeters(photo, resulting) > rules.radiusMeters)) return false;
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

export const pointMembers = (point) => point.emptyFromMove ? [] : point.members || [point];
export const sourcePhotoCount = (points) => points.reduce((count, point) => count + pointMembers(point).length, 0);
export const hasPublishedPoints = (points) => points.some((point) => point.uploadResult?.links?.length || point.uploadResult?.stale);

function availableIdentity(point, occupied) {
  let id = point.id;
  while (occupied.has(id)) id = `point:${id}`;
  occupied.add(id);
  return { ...point, id };
}

export function splitPoint(points, id) {
  if (hasPublishedPoints(points)) return points;
  const occupied = new Set(points.filter((point) => point.id !== id).map((point) => point.id));
  return points.flatMap((point) => point.id === id && !point.removed ? pointMembers(point).map((photo, index) =>
    availableIdentity({ ...makePoint([photo]), ...(index === 0 ? { excludedMembers: point.excludedMembers || [], memberUndo: point.memberUndo || [] } : {}) }, occupied)) : [point]);
}

export function mergePoint(points, id, direction) {
  if (hasPublishedPoints(points) || ![-1, 1].includes(direction)) return points;
  const position = points.findIndex((point) => point.id === id);
  const neighbor = position + direction;
  if (position < 0 || neighbor < 0 || neighbor >= points.length) return points;
  if (points[position].removed || points[neighbor].removed) return points;
  const start = Math.min(position, neighbor);
  const occupied = new Set(points.filter((_, index) => index !== start && index !== start + 1).map((point) => point.id));
  return [...points.slice(0, start), availableIdentity({ ...makePoint([...pointMembers(points[start]), ...pointMembers(points[start + 1])]),
    excludedMembers: [...(points[start].excludedMembers || []), ...(points[start + 1].excludedMembers || [])],
    memberUndo: [...(points[start].memberUndo || []), ...(points[start + 1].memberUndo || [])].sort((a, b) => a.order - b.order) }, occupied),
    ...points.slice(start + 2)];
}

const invalidatePublication = (point) => ({ ...point.uploadResult,
  stale: Boolean(point.uploadResult?.stale || point.uploadResult?.links?.length),
  staleLinks: point.uploadResult?.links?.length ? point.uploadResult.links : point.uploadResult?.staleLinks || [],
  links: [],
});

function withMembers(point, members) {
  return { ...point, ...makePoint(members), id: point.id,
    reviewSection: point.reviewSection, reviewSlot: point.reviewSlot,
    removed: false, emptyFromMove: false, memberRemovedLast: false, publishError: undefined,
    uploadResult: invalidatePublication(point) };
}

export function removeMember(points, pointId, memberId) {
  return points.map((point) => {
    if (point.id !== pointId || point.removed) return point;
    const members = pointMembers(point);
    const member = members.find((photo) => photo.id === memberId);
    if (!member) return point;
    const order = Math.max(0, ...points.flatMap((item) => (item.memberUndo || []).map((entry) => entry.order))) + 1;
    const memberUndo = [...(point.memberUndo || []), { memberId, order }];
    // Keep the final member in the existing recoverable removed-point slot.
    if (members.length === 1) return { ...point, removed: true, memberRemovedLast: true, memberUndo, uploadResult: invalidatePublication(point) };
    return { ...withMembers(point, members.filter((photo) => photo.id !== memberId)),
      excludedMembers: [...(point.excludedMembers || []), member], memberUndo };
  });
}

// Restore only the removed member into the current edited membership. Never
// revive a snapshot's obsolete publication or overwrite subsequent moves/appends.
export function restoreLastMember(points, pointId) {
  const point = points.find((item) => item.id === pointId);
  const entry = point?.memberUndo?.at(-1);
  if (!entry) return points;
  const member = point.excludedMembers?.find((item) => item.id === entry.memberId);
  const retained = point.removed && !point.emptyFromMove
    && pointMembers(point).some((item) => item.id === entry.memberId);
  if (!member && !retained) return points;
  if (member && points.some((item) => pointMembers(item).some((photo) => photo.id === member.id))) return points;
  return points.map((item) => item.id !== pointId ? item : {
    ...withMembers(item, member ? [...pointMembers(item), member] : pointMembers(item)),
    excludedMembers: (item.excludedMembers || []).filter((photo) => photo.id !== entry.memberId),
    memberUndo: item.memberUndo.slice(0, -1),
  });
}

export function moveMember(points, sourceId, memberId, targetId) {
  const source = points.find((point) => point.id === sourceId && !point.removed);
  const target = points.find((point) => point.id === targetId && !point.removed);
  const member = source && pointMembers(source).find((photo) => photo.id === memberId);
  if (!member || !target || sourceId === targetId) return points;
  return points.map((point) => {
    if (point.id === targetId) return withMembers(point, [...pointMembers(point), member]);
    if (point.id !== sourceId) return point;
    const remaining = pointMembers(point).filter((photo) => photo.id !== memberId);
    return remaining.length ? withMembers(point, remaining)
      : { ...point, members: [member], removed: true, emptyFromMove: true, uploadResult: invalidatePublication(point) };
  });
}

export function restoreMemberPoint(points, id) {
  const point = points.find((item) => item.id === id);
  if (point?.removed && point.memberRemovedLast && point.memberUndo?.length && !point.emptyFromMove) return restoreLastMember(points, id);
  if (!point?.emptyFromMove) return points.map((item) => item.id === id ? { ...item, removed: false } : item);
  // An empty source keeps only a recovery snapshot, never duplicate ownership.
  const memberId = point.members[0].id;
  const owner = points.find((item) => pointMembers(item).some((member) => member.id === memberId));
  if (!owner) {
    const excluded = points.find((item) => item.excludedMembers?.some((member) => member.id === memberId));
    if (!excluded) return points;
    const member = excluded.excludedMembers.find((item) => item.id === memberId);
    return points.map((item) => item.id === id ? withMembers(item, [member])
      : item.id === excluded.id ? { ...item, excludedMembers: item.excludedMembers.filter((photo) => photo.id !== memberId),
        memberUndo: (item.memberUndo || []).filter((entry) => entry.memberId !== memberId) } : item);
  }
  const ready = points.map((item) => item.id === id
    ? { ...item, removed: false, emptyFromMove: false, members: [] }
    : item.id === owner.id ? { ...item, removed: false } : item);
  return moveMember(ready, owner.id, memberId, id);
}

export function appendPhotos(points, photos, rules = GROUP_DEFAULTS) {
  let next = [...points];
  for (const photo of [...photos].sort(byOrder)) {
    const matches = next.filter((point) => !point.removed && canJoin(pointMembers(point), photo, rules));
    // The accepted evidence must identify exactly one entity; never coalesce
    // manually separated points or attach into an excluded placeholder.
    if (matches.length === 1) next = next.map((point) => point.id === matches[0].id
      ? withMembers(point, [...pointMembers(point), photo]) : point);
    else next.push(makePoint([photo]));
  }
  return next;
}
