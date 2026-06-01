export const EARTH_RADIUS_METERS = 6371000;

const toRadians = (degrees) => (degrees * Math.PI) / 180;

const getLatitude = (point) => point?.latitude ?? point?.coordinates?.latitude;
const getLongitude = (point) => point?.longitude ?? point?.coordinates?.longitude;

export function isValidCoordinate(latitude, longitude) {
  const lat = Number(latitude);
  const lon = Number(longitude);

  return Number.isFinite(lat)
    && Number.isFinite(lon)
    && lat >= -90
    && lat <= 90
    && lon >= -180
    && lon <= 180;
}

export function haversineDistanceMeters(pointA, pointB) {
  const latitudeA = Number(getLatitude(pointA));
  const longitudeA = Number(getLongitude(pointA));
  const latitudeB = Number(getLatitude(pointB));
  const longitudeB = Number(getLongitude(pointB));

  if (!isValidCoordinate(latitudeA, longitudeA) || !isValidCoordinate(latitudeB, longitudeB)) {
    return null;
  }

  const lat1 = toRadians(latitudeA);
  const lat2 = toRadians(latitudeB);
  const deltaLat = toRadians(latitudeB - latitudeA);
  const deltaLon = toRadians(longitudeB - longitudeA);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

const getPointLabel = (point, fallbackIndex) => {
  if (point.displayIndex) return `№${point.displayIndex}`;
  if (point.indexFromOcr) return `№${point.indexFromOcr}`;
  if (point.number) return `Фото №${point.number}`;
  if (point.fileName || point.originalName) return point.fileName || point.originalName;
  return `Точка ${fallbackIndex + 1}`;
};

const getPointFileName = (point) => point.fileName || point.originalName || '';

const getValidPoints = (points) => points
  .map((point, index) => ({
    ...point,
    __index: index,
    latitude: Number(getLatitude(point)),
    longitude: Number(getLongitude(point)),
  }))
  .filter((point) => isValidCoordinate(point.latitude, point.longitude));

export function buildDistanceMatrix(points) {
  const validPoints = getValidPoints(points);

  return validPoints.map((pointA, rowIndex) => validPoints.map((pointB, columnIndex) => {
    if (rowIndex === columnIndex) {
      return null;
    }

    return {
      pointAId: pointA.id,
      pointBId: pointB.id,
      distanceMeters: haversineDistanceMeters(pointA, pointB),
    };
  }));
}

export function findDistanceViolations(points, options = {}) {
  const thresholdMeters = Number.isFinite(Number(options.thresholdMeters))
    ? Number(options.thresholdMeters)
    : 25;
  const validPoints = getValidPoints(points);
  const violations = [];

  for (let i = 0; i < validPoints.length; i += 1) {
    for (let j = i + 1; j < validPoints.length; j += 1) {
      const pointA = validPoints[i];
      const pointB = validPoints[j];
      const distanceMeters = haversineDistanceMeters(pointA, pointB);

      if (distanceMeters !== null && distanceMeters < thresholdMeters) {
        violations.push({
          pointAId: pointA.id,
          pointBId: pointB.id,
          pointALabel: getPointLabel(pointA, pointA.__index),
          pointBLabel: getPointLabel(pointB, pointB.__index),
          pointAFileName: getPointFileName(pointA),
          pointBFileName: getPointFileName(pointB),
          distanceMeters,
          thresholdMeters,
          photoAId: pointA.id,
          photoBId: pointB.id,
          photoANumber: pointA.number,
          photoBNumber: pointB.number,
          distance: distanceMeters,
        });
      }
    }
  }

  return violations;
}

export function markProblemPoints(points, violations) {
  const problemIds = new Set(violations.flatMap((violation) => [violation.pointAId, violation.pointBId]));

  return points.map((point) => {
    const hasCoordinates = isValidCoordinate(getLatitude(point), getLongitude(point));
    const ownViolations = violations.filter((violation) => (
      violation.pointAId === point.id || violation.pointBId === point.id
    ));

    if (!hasCoordinates) {
      return {
        ...point,
        distanceStatus: 'missing_coordinates',
        distanceWarnings: ['missing_coordinates'],
      };
    }

    if (problemIds.has(point.id)) {
      return {
        ...point,
        distanceStatus: 'too_close',
        distanceWarnings: ownViolations.map((violation) => {
          const otherLabel = violation.pointAId === point.id ? violation.pointBLabel : violation.pointALabel;
          return `${otherLabel}: ${formatDistanceMeters(violation.distanceMeters)} м`;
        }),
      };
    }

    return {
      ...point,
      distanceStatus: 'ok',
      distanceWarnings: [],
    };
  });
}

export function buildRemovalRecommendation(violations, points) {
  if (violations.length === 0) {
    return { message: 'Нарушений нет', candidates: [], maxConflicts: 0, tie: false };
  }

  const counts = new Map();
  violations.forEach((violation) => {
    counts.set(violation.pointAId, (counts.get(violation.pointAId) || 0) + 1);
    counts.set(violation.pointBId, (counts.get(violation.pointBId) || 0) + 1);
  });

  const maxConflicts = Math.max(...counts.values());
  const candidates = points
    .filter((point) => counts.get(point.id) === maxConflicts)
    .map((point, index) => ({ ...point, label: getPointLabel(point, index), conflicts: maxConflicts }));

  return {
    message: candidates.length > 1
      ? `Рекомендация: возможна ничья — ${candidates.map((point) => point.label).join(', ')}`
      : `Рекомендация: проверить ${candidates[0].label}`,
    candidates,
    maxConflicts,
    tie: candidates.length > 1,
  };
}

export function formatDistanceMeters(distanceMeters) {
  const value = Number(distanceMeters);

  if (!Number.isFinite(value)) {
    return '';
  }

  return value < 100 ? value.toFixed(1) : value.toFixed(0);
}
