export const EARTH_RADIUS_METERS = 6371000;

const toRadians = (degrees) => (degrees * Math.PI) / 180;

const getLatitude = (point) => point?.latitude ?? point?.coordinates?.latitude;
const getLongitude = (point) => point?.longitude ?? point?.coordinates?.longitude;

const toCoordinateNumber = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string' && value.trim() === '') {
    return null;
  }

  const numeric = Number(String(value).replace(',', '.'));
  return Number.isFinite(numeric) ? numeric : null;
};

export function isZeroZeroCoordinate(latitude, longitude) {
  const lat = toCoordinateNumber(latitude);
  const lon = toCoordinateNumber(longitude);

  return lat !== null
    && lon !== null
    && Math.abs(lat) < 0.000001
    && Math.abs(lon) < 0.000001;
}

export function isValidCoordinate(latitude, longitude) {
  const lat = toCoordinateNumber(latitude);
  const lon = toCoordinateNumber(longitude);

  return lat !== null
    && lon !== null
    && lat >= -90
    && lat <= 90
    && lon >= -180
    && lon <= 180;
}

export function hasUsableCoordinates(point) {
  const latitude = getLatitude(point);
  const longitude = getLongitude(point);

  if (!point || !isValidCoordinate(latitude, longitude)) {
    return false;
  }

  if (point.coordinates === null) {
    return false;
  }

  if (point.coordinateQuality && !['confident', 'manual'].includes(point.coordinateQuality)) return false;

  if (point.gpsSource === 'missing' || point.gpsStatus === 'missing') {
    return false;
  }

  if (Array.isArray(point.gpsWarnings) && point.gpsWarnings.includes('zero_zero_placeholder')) {
    return false;
  }

  if (isZeroZeroCoordinate(latitude, longitude)) {
    return point.gpsSource === 'manual' && point.zeroZeroConfirmed === true;
  }

  return point.gpsStatus === 'found' || point.gpsStatus === 'done' || point.gpsSource === 'manual';
}

export const isUsablePointCoordinate = hasUsableCoordinates;

export function haversineDistanceMeters(pointA, pointB) {
  const latitudeA = toCoordinateNumber(getLatitude(pointA));
  const longitudeA = toCoordinateNumber(getLongitude(pointA));
  const latitudeB = toCoordinateNumber(getLatitude(pointB));
  const longitudeB = toCoordinateNumber(getLongitude(pointB));

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

export const getValidPointsForDistance = (points) => points
  .map((point, index) => ({
    ...point,
    __index: index,
    latitude: toCoordinateNumber(getLatitude(point)),
    longitude: toCoordinateNumber(getLongitude(point)),
  }))
  .filter(hasUsableCoordinates);

export function buildDistanceMatrix(points) {
  const validPoints = getValidPointsForDistance(points);

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
  const validPoints = getValidPointsForDistance(points);
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
    const hasCoordinates = hasUsableCoordinates(point);
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
