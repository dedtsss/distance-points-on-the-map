import { recommendReserveForConflicts } from './features/session/conflictResolver.js';
import { findDistanceViolations } from './utils/geoDistance.js';
import { validateCoordinateBatch } from './features/gps/coordinateSanity.js';

const pointLabel = (photo) => photo?.indexFromOcr ? `#${photo.indexFromOcr}`
  : photo?.number ? `Точка ${photo.number}` : 'Точка';

export function splitBatch(photos, thresholdMeters = 25) {
  const indexed = photos.filter((photo) => photo.indexFromOcr && photo.indexStatus === 'found');
  const sanity = validateCoordinateBatch(indexed);
  const checked = photos.map((photo) => ({ ...photo, ...(sanity.byPhotoId.get(photo.id) || {}) }));
  const eligible = checked.filter((photo) => photo.coordinateQuality === 'confident' && photo.coordinates
    && photo.indexFromOcr && photo.indexStatus === 'found');
  const unresolved = checked.filter((photo) => !eligible.includes(photo))
    .map((photo) => ({ ...photo, workStatus: 'unresolved',
      reviewReason: !photo.coordinates ? 'coordinates_missing'
        : !photo.indexFromOcr ? 'index_missing'
          : photo.indexStatus !== 'found' ? 'index_low_confidence'
            : photo.sanityReason || (photo.coordinateQuality === 'low_precision'
              ? 'coordinates_low_precision' : 'coordinates_low_confidence') }));
  const recommendation = recommendReserveForConflicts(eligible, thresholdMeters);
  const reserveIds = new Set(recommendation.reservePhotoIds);
  const conflicts = findDistanceViolations(eligible, { thresholdMeters });
  const byId = new Map(eligible.map((photo) => [photo.id, photo]));
  const conflictDetails = (photo) => conflicts.flatMap((conflict) => {
    if (conflict.pointAId !== photo.id && conflict.pointBId !== photo.id) return [];
    const otherId = conflict.pointAId === photo.id ? conflict.pointBId : conflict.pointAId;
    const other = byId.get(otherId);
    return [{
      otherId,
      otherLabel: pointLabel(other),
      otherStatus: reserveIds.has(otherId) ? 'reserve' : 'main',
      distanceMeters: conflict.distanceMeters,
    }];
  }).sort((left, right) => (left.otherStatus === right.otherStatus ? 0 : left.otherStatus === 'main' ? -1 : 1)
    || left.distanceMeters - right.distanceMeters || left.otherLabel.localeCompare(right.otherLabel));

  const resolved = eligible.map((photo) => ({
    ...photo,
    workStatus: reserveIds.has(photo.id) ? 'reserve' : 'active',
    reserveConflicts: reserveIds.has(photo.id) ? conflictDetails(photo) : [],
  }));
  return {
    main: resolved.filter((photo) => photo.workStatus === 'active'),
    reserve: resolved.filter((photo) => photo.workStatus === 'reserve'),
    unresolved,
    recommendation,
    remainingConflicts: findDistanceViolations(resolved, { thresholdMeters }),
  };
}
