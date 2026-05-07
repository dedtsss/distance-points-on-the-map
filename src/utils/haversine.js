const EARTH_RADIUS_METERS = 6371000;

const toRadians = (degrees) => (degrees * Math.PI) / 180;

export function haversineDistanceMeters(pointA, pointB) {
  const lat1 = toRadians(pointA.latitude);
  const lat2 = toRadians(pointB.latitude);
  const deltaLat = toRadians(pointB.latitude - pointA.latitude);
  const deltaLon = toRadians(pointB.longitude - pointA.longitude);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

export function findViolations(photos, thresholdMeters) {
  const photosWithGps = photos.filter((photo) => photo.gpsStatus === 'found' && photo.coordinates);
  const violations = [];

  for (let i = 0; i < photosWithGps.length; i += 1) {
    for (let j = i + 1; j < photosWithGps.length; j += 1) {
      const distance = haversineDistanceMeters(
        photosWithGps[i].coordinates,
        photosWithGps[j].coordinates,
      );

      if (distance < thresholdMeters) {
        violations.push({
          photoAId: photosWithGps[i].id,
          photoBId: photosWithGps[j].id,
          photoANumber: photosWithGps[i].number,
          photoBNumber: photosWithGps[j].number,
          distance,
        });
      }
    }
  }

  return violations;
}

export function buildRemovalRecommendation(violations, photos) {
  if (violations.length === 0) {
    return { message: 'Нарушений нет', candidates: [], maxConflicts: 0, tie: false };
  }

  const counts = new Map();
  violations.forEach((violation) => {
    counts.set(violation.photoAId, (counts.get(violation.photoAId) || 0) + 1);
    counts.set(violation.photoBId, (counts.get(violation.photoBId) || 0) + 1);
  });

  const maxConflicts = Math.max(...counts.values());
  const candidates = photos
    .filter((photo) => counts.get(photo.id) === maxConflicts)
    .map((photo) => ({ ...photo, conflicts: maxConflicts }));

  return {
    message: candidates.length > 1
      ? `Рекомендация: возможна ничья — ${candidates.map((photo) => `Фото №${photo.number}`).join(', ')}`
      : `Рекомендация: убрать Фото №${candidates[0].number}`,
    candidates,
    maxConflicts,
    tie: candidates.length > 1,
  };
}
