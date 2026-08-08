import { DEFAULT_DISTANCE_THRESHOLD_METERS } from '../distance/distanceService.js';
import { buildPointIdentity } from '../points/pointIdentity.js';
import {
  haversineDistanceMeters,
  isReservePoint,
  isValidCoordinate,
} from '../../utils/geoDistance.js';

const coordinateNumber = (value) => {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const number = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(number) ? number : null;
};

const coordinatesForPhoto = (photo) => {
  const latitude = coordinateNumber(photo?.coordinates?.latitude ?? photo?.latitude);
  const longitude = coordinateNumber(photo?.coordinates?.longitude ?? photo?.longitude);
  return isValidCoordinate(latitude, longitude) ? { latitude, longitude } : null;
};

export const mapPointLabel = (photo) => buildPointIdentity(photo).pointLabel;

export const isStrictDistancePoint = (photo) => (
  Boolean(coordinatesForPhoto(photo))
  && ['confident', 'manual'].includes(photo.coordinateQuality)
  && !['missing', 'suspicious', 'low_precision'].includes(photo.gpsStatus)
);

export function buildMapModel(photos, thresholdMeters = DEFAULT_DISTANCE_THRESHOLD_METERS) {
  const threshold = Number.isFinite(Number(thresholdMeters))
    ? Number(thresholdMeters)
    : DEFAULT_DISTANCE_THRESHOLD_METERS;
  const points = (photos || [])
    .map((photo, order) => {
      const coordinates = coordinatesForPhoto(photo);
      if (!coordinates) return null;
      return {
        id: photo.id,
        photo,
        order,
        label: mapPointLabel(photo),
        coordinates,
        strict: isStrictDistancePoint(photo),
        lowPrecision: photo.coordinateQuality === 'low_precision',
        suspicious: photo.coordinateQuality === 'suspicious',
        reserve: isReservePoint(photo),
        distanceStatus: photo.distanceStatus || 'pending',
      };
    })
    .filter(Boolean);

  const strictPoints = points.filter((point) => point.strict);
  const activeStrictPoints = strictPoints.filter((point) => !point.reserve);
  const lines = [];
  for (let i = 0; i < activeStrictPoints.length; i += 1) {
    for (let j = i + 1; j < activeStrictPoints.length; j += 1) {
      const pointA = activeStrictPoints[i];
      const pointB = activeStrictPoints[j];
      const distanceMeters = haversineDistanceMeters(pointA.coordinates, pointB.coordinates);
      if (distanceMeters === null) continue;
      lines.push({
        id: `${pointA.id}-${pointB.id}`,
        pointAId: pointA.id,
        pointBId: pointB.id,
        pointALabel: pointA.label,
        pointBLabel: pointB.label,
        distanceMeters,
        conflict: distanceMeters < threshold,
      });
    }
  }

  const conflicts = lines.filter((line) => line.conflict);
  return {
    thresholdMeters: threshold,
    points,
    strictPoints,
    activeStrictPoints,
    lines,
    conflicts,
    missingCoordinates: (photos || []).filter((photo) => !coordinatesForPhoto(photo)),
    lowPrecision: points.filter((point) => point.lowPrecision).map((point) => point.photo),
    suspicious: points.filter((point) => point.suspicious).map((point) => point.photo),
  };
}
