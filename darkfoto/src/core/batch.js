import { recommendReserveForConflicts } from './features/session/conflictResolver.js';
import { findDistanceViolations } from './utils/geoDistance.js';
import { validateCoordinateBatch } from './features/gps/coordinateSanity.js';

export function splitBatch(photos, thresholdMeters = 25) {
  const sanity = validateCoordinateBatch(photos);
  const checked = photos.map((photo) => ({ ...photo, ...(sanity.byPhotoId.get(photo.id) || {}) }));
  const recommendation = recommendReserveForConflicts(checked, thresholdMeters);
  const reserveIds = new Set(recommendation.reservePhotoIds);
  const resolved = checked.map((photo) => ({
    ...photo,
    workStatus: reserveIds.has(photo.id) ? 'reserve' : 'active',
  }));
  return {
    main: resolved.filter((photo) => photo.workStatus === 'active'),
    reserve: resolved.filter((photo) => photo.workStatus === 'reserve'),
    unresolved: resolved.filter((photo) => photo.coordinateQuality !== 'confident'),
    recommendation,
    remainingConflicts: findDistanceViolations(resolved, { thresholdMeters }),
  };
}
