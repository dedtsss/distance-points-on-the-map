import { recommendReserveForConflicts } from './features/session/conflictResolver.js';
import { findDistanceViolations, distanceBelowThreshold } from './utils/geoDistance.js';
import { validateCoordinateBatch } from './features/gps/coordinateSanity.js';
import { activePoints } from '../pointState.js';

const pointLabel = (photo) => photo?.indexFromOcr ? `#${photo.indexFromOcr}`
  : photo?.number ? `Точка ${photo.number}` : 'Точка';

export const ACCEPTED_TOLERANCE_METERS = 2;

export function splitBatch(photos, thresholdMeters = 25, { indexMode = true } = {}) {
  photos = activePoints(photos);
  const indexed = photos.filter((photo) => !indexMode || (photo.indexFromOcr && photo.indexStatus === 'found'));
  const sanity = validateCoordinateBatch(indexed);
  const checked = photos.map((photo) => ({ ...photo, ...(sanity.byPhotoId.get(photo.id) || {}) }));
  const eligible = checked.filter((photo) => photo.coordinateQuality === 'confident' && photo.coordinates
    && (!indexMode || (photo.indexFromOcr && photo.indexStatus === 'found')));
  const unresolved = checked.filter((photo) => !eligible.includes(photo))
    .map((photo) => ({ ...photo, workStatus: 'unresolved',
      reviewReason: !photo.coordinates ? 'coordinates_missing'
        : indexMode && !photo.indexFromOcr ? 'index_missing'
          : indexMode && photo.indexStatus !== 'found' ? 'index_low_confidence'
            : photo.sanityReason || (photo.coordinateQuality === 'low_precision'
              ? 'coordinates_low_precision' : 'coordinates_low_confidence') }));
  // Classifications are derived afresh; never feed yesterday's Reserve back
  // into distance analysis. Owner overrides belong to the saved logical point.
  eligible.forEach((photo) => { photo.workStatus = 'active'; });
  const hardThreshold = thresholdMeters - ACCEPTED_TOLERANCE_METERS;
  const recommendation = recommendReserveForConflicts(eligible, hardThreshold);
  const reserveIds = new Set(recommendation.reservePhotoIds);
  const conflicts = findDistanceViolations(eligible, { thresholdMeters });
  const byId = new Map(eligible.map((photo) => [photo.id, photo]));
  const conflictDetails = (photo, accept = () => true) => conflicts.flatMap((conflict) => {
    if (conflict.pointAId !== photo.id && conflict.pointBId !== photo.id) return [];
    if (!accept(conflict)) return [];
    const otherId = conflict.pointAId === photo.id ? conflict.pointBId : conflict.pointAId;
    const other = byId.get(otherId);
    return [{
      otherId,
      otherLabel: indexMode ? pointLabel(other) : `Точка ${other.number}`,
      otherStatus: reserveIds.has(otherId) ? 'reserve' : 'main',
      distanceMeters: conflict.distanceMeters,
    }];
  }).sort((left, right) => (left.otherStatus === right.otherStatus ? 0 : left.otherStatus === 'main' ? -1 : 1)
    || left.distanceMeters - right.distanceMeters || left.otherLabel.localeCompare(right.otherLabel));

  const resolved = eligible.map((photo) => ({
    ...photo,
    workStatus: reserveIds.has(photo.id) ? 'reserve' : 'active',
    reserveConflicts: reserveIds.has(photo.id) ? conflictDetails(photo) : [],
    toleranceConflicts: reserveIds.has(photo.id) ? [] : conflictDetails(photo, (pair) => !distanceBelowThreshold(pair.distanceMeters, hardThreshold))
      .filter((pair) => pair.otherStatus === 'main'),
    manualConflicts: photo.statusOverride === 'main' ? conflictDetails(photo, (pair) => distanceBelowThreshold(pair.distanceMeters, hardThreshold))
      .filter((pair) => pair.otherStatus === 'main') : [],
  }));
  return {
    indexMode,
    main: resolved.filter((photo) => photo.workStatus === 'active'),
    reserve: resolved.filter((photo) => photo.workStatus === 'reserve'),
    unresolved,
    recommendation,
    remainingConflicts: findDistanceViolations(resolved, { thresholdMeters: hardThreshold }),
  };
}
