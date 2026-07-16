import {
  findDistanceViolations,
  getValidPointsForDistance,
  markProblemPoints,
} from '../../utils/geoDistance.js';

export const DEFAULT_DISTANCE_THRESHOLD_METERS = 25;

export function calculateDistances(photos, thresholdMeters = DEFAULT_DISTANCE_THRESHOLD_METERS) {
  const violations = findDistanceViolations(photos, { thresholdMeters });
  const markedPhotos = markProblemPoints(photos, violations);
  const byPhotoId = new Map(markedPhotos.map((photo) => [photo.id, {
    distanceStatus: photo.distanceStatus,
    distanceConflicts: photo.distanceWarnings || [],
  }]));
  const usableCount = getValidPointsForDistance(photos).length;
  const lowPrecisionCount = photos.filter((photo) => photo.coordinateQuality === 'low_precision').length;

  return {
    thresholdMeters,
    violations,
    byPhotoId,
    usableCount,
    lowPrecisionCount,
    missingCount: photos.length - usableCount - lowPrecisionCount,
  };
}
