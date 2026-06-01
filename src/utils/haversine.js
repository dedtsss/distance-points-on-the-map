import {
  buildRemovalRecommendation,
  findDistanceViolations,
  haversineDistanceMeters,
} from './geoDistance';

export { buildRemovalRecommendation, haversineDistanceMeters };

export function findViolations(photos, thresholdMeters) {
  return findDistanceViolations(photos, { thresholdMeters });
}
