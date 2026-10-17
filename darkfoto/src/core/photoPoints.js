import { haversineDistanceMeters } from './utils/geoDistance.js';
import { normalizeCoordinates } from './features/gps/coordinateParser.js';

// Point identity is independent of the business distance between points.
export const GROUP_DEFAULTS = Object.freeze({ radiusMeters: 4 });
export const recognizedIndex = (photo) => photo.indexStatus === 'found'
  && /^\d{4,5}$/.test(String(photo.indexFromOcr || ''));
const validCoordinates = (photo) => photo.coordinateQuality === 'confident'
  && normalizeCoordinates(photo.coordinates?.latitude, photo.coordinates?.longitude);
const byOrder = (a, b) => a.number - b.number || String(a.id).localeCompare(String(b.id));

export function makePoint(members, manualRepresentativeId = null) {
  const ordered = [...members].sort(byOrder);
  const valid = ordered.filter(validCoordinates);
  const accurate = valid.filter((photo) => Number.isFinite(photo.accuracyMeters) && photo.accuracyMeters >= 0)
    .sort((a, b) => a.accuracyMeters - b.accuracyMeters || byOrder(a, b));
  const manual = ordered.find((photo) => photo.id === manualRepresentativeId);
  const representative = manual || accurate[0] || valid[0] || ordered[0];
  const index = recognizedIndex(representative) ? representative : ordered.find(recognizedIndex);
  return { ...representative,
    id: ordered.length === 1 ? ordered[0].id : `point:${ordered.map((photo) => photo.id).join(':')}`,
    number: ordered[0].number, members: ordered, representativeId: representative.id,
    manualRepresentativeId: manual?.id || null,
    indexFromOcr: index?.indexFromOcr || representative.indexFromOcr || null,
    indexStatus: index ? 'found' : representative.indexStatus,
    uploadResult: ordered.length === 1 ? ordered[0].uploadResult || { links: [] } : { links: [] },
  };
}

function canJoin(members, candidate, rules) {
  if (!validCoordinates(candidate) || !members.length || !members.every(validCoordinates)) return false;
  // Complete-link bound: anchor/representative-only tests permit A-B-C bridges.
  return members.every((member) => {
    const distance = haversineDistanceMeters(member, candidate);
    return distance !== null && distance <= rules.radiusMeters + 1e-7;
  });
}

function nearestGroup(groups, photo, rules) {
  return groups.filter((members) => canJoin(members, photo, rules))
    .map((members) => ({ members, duplicate: members.some((member) => haversineDistanceMeters(member, photo) === 0),
      distance: haversineDistanceMeters(makePoint(members), photo) }))
    .sort((a, b) => Number(b.duplicate) - Number(a.duplicate) || a.distance - b.distance
      || byOrder(a.members[0], b.members[0]))[0]?.members;
}

export function groupPhotos(photos, rules = GROUP_DEFAULTS) {
  const groups = [];
  for (const photo of [...photos].sort(byOrder)) {
    const match = nearestGroup(groups, photo, rules);
    if (match) match.push(photo);
    else groups.push([photo]);
  }
  return groups.map((members) => makePoint(members));
}

// Explicitly rebuild from recognized evidence, including photos previously
// excluded/removed. Never read original files, replace GPS, or run recognition.
export function regroupPhotos(points, rules = GROUP_DEFAULTS) {
  const originals = points.flatMap((point) => [...pointMembers(point), ...(point.excludedMembers || [])]);
  const photos = originals.map((photo) => ({ ...photo, statusOverride: null,
    manualRepresentativeId: null, removed: false, emptyFromMove: false,
    excludedMembers: [], memberUndo: [], reviewSection: undefined, reviewSlot: undefined,
    uploadResult: { links: [] }, publishError: undefined }));
  return groupPhotos(photos, rules).map((point) => {
    const ids = new Set(point.members.map((photo) => photo.id));
    const owners = points.filter((old) => [...pointMembers(old), ...(old.excludedMembers || [])].some((photo) => ids.has(photo.id)));
    const staleLinks = owners.flatMap((old) => [...(old.uploadResult?.links || []), ...(old.uploadResult?.staleLinks || [])]);
    return { ...point, uploadResult: { links: [], staleLinks,
      stale: Boolean(staleLinks.length || owners.some((old) => old.uploadResult?.stale)) } };
  });
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
    availableIdentity({ ...makePoint([photo], point.manualRepresentativeId), statusOverride: point.statusOverride || null,
      ...(index === 0 ? { excludedMembers: point.excludedMembers || [], memberUndo: point.memberUndo || [] } : {}) }, occupied)) : [point]);
}

export function mergePoint(points, id, direction) {
  if (hasPublishedPoints(points) || ![-1, 1].includes(direction)) return points;
  const position = points.findIndex((point) => point.id === id);
  const neighbor = position + direction;
  if (position < 0 || neighbor < 0 || neighbor >= points.length) return points;
  if (points[position].removed || points[neighbor].removed) return points;
  const start = Math.min(position, neighbor);
  const occupied = new Set(points.filter((_, index) => index !== start && index !== start + 1).map((point) => point.id));
  return [...points.slice(0, start), availableIdentity({ ...makePoint([...pointMembers(points[start]), ...pointMembers(points[start + 1])],
    points[start].manualRepresentativeId || points[start + 1].manualRepresentativeId),
    statusOverride: points[position].statusOverride || points[neighbor].statusOverride || null,
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
  return { ...point, ...makePoint(members, point.manualRepresentativeId), id: point.id,
    reviewSection: point.reviewSection, reviewSlot: point.reviewSlot,
    removed: false, emptyFromMove: false, memberRemovedLast: false, publishError: undefined,
    uploadResult: invalidatePublication(point) };
}

// Explicit visual merge keeps the destination's identity and owner choices.
// Published inputs become stale; their old URLs must never describe new members.
export function mergeIntoPoint(points, sourceId, targetId) {
  const source = points.find((point) => point.id === sourceId && !point.removed);
  const target = points.find((point) => point.id === targetId && !point.removed);
  if (!source || !target || source === target) return points;
  const merged = withMembers({ ...target,
    manualRepresentativeId: target.manualRepresentativeId || source.manualRepresentativeId,
  }, [...pointMembers(target), ...pointMembers(source)]);
  const staleLinks = [target, source].flatMap((point) => [
    ...(point.uploadResult?.links || []), ...(point.uploadResult?.staleLinks || []),
  ]);
  return points.filter((point) => point.id !== sourceId).map((point) => point.id !== targetId ? point : {
    ...merged, statusOverride: target.statusOverride || source.statusOverride || null,
    excludedMembers: [...(target.excludedMembers || []), ...(source.excludedMembers || [])],
    memberUndo: [...(target.memberUndo || []), ...(source.memberUndo || [])].sort((a, b) => a.order - b.order),
    uploadResult: { ...merged.uploadResult, stale: Boolean(staleLinks.length || source.uploadResult?.stale || merged.uploadResult?.stale), staleLinks },
  });
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
    : item.id === owner.id ? { ...item, removed: false, memberRemovedLast: false,
      memberUndo: (item.memberUndo || []).filter((entry) => entry.memberId !== memberId) } : item);
  return moveMember(ready, owner.id, memberId, id);
}

export function appendPhotos(points, photos, rules = GROUP_DEFAULTS) {
  let next = [...points];
  for (const photo of [...photos].sort(byOrder)) {
    const candidates = next.filter((point) => !point.removed);
    const groups = candidates.map(pointMembers);
    const members = nearestGroup(groups, photo, rules);
    const match = candidates[groups.indexOf(members)];
    if (match) next = next.map((point) => point.id === match.id
      ? withMembers(point, [...pointMembers(point), photo]) : point);
    else next.push(makePoint([photo]));
  }
  return next;
}

// Rebuild the same point so every coordinate consumer sees the selected member.
export function selectRepresentative(points, pointId, memberId) {
  return points.map((point) => point.id === pointId && !point.removed
    && pointMembers(point).some((member) => member.id === memberId)
    ? withMembers({ ...point, manualRepresentativeId: memberId }, pointMembers(point)) : point);
}
