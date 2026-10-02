import { recommendReserveForConflicts } from './features/session/conflictResolver.js';
import { findDistanceViolations } from './utils/geoDistance.js';
import { validateCoordinateBatch } from './features/gps/coordinateSanity.js';

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
  const resolved = eligible.map((photo) => ({
    ...photo,
    workStatus: reserveIds.has(photo.id) ? 'reserve' : 'active',
  }));
  return {
    main: resolved.filter((photo) => photo.workStatus === 'active'),
    reserve: resolved.filter((photo) => photo.workStatus === 'reserve'),
    unresolved,
    recommendation,
    remainingConflicts: findDistanceViolations(resolved, { thresholdMeters }),
  };
}
