import { haversineDistanceMeters, isValidCoordinate } from '../../utils/geoDistance.js';

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const KARELIA = { minLat: 60, maxLat: 70, minLon: 25, maxLon: 40 };
const inKarelia = ({ latitude, longitude }) => (
  latitude >= KARELIA.minLat && latitude <= KARELIA.maxLat
  && longitude >= KARELIA.minLon && longitude <= KARELIA.maxLon
);

export function validateCoordinateBatch(photos, options = {}) {
  const thresholdMeters = Number(options.outlierThresholdMeters) || 150_000;
  const candidates = (photos || []).filter((photo) => (
    photo.coordinates && isValidCoordinate(photo.coordinates.latitude, photo.coordinates.longitude)
  ));
  const cluster = candidates.length >= 3 ? {
    latitude: median(candidates.map((photo) => photo.coordinates.latitude)),
    longitude: median(candidates.map((photo) => photo.coordinates.longitude)),
  } : null;
  const byPhotoId = new Map();

  for (const photo of photos || []) {
    if (photo.manualCoordinates) {
      byPhotoId.set(photo.id, { coordinateQuality: 'manual', gpsStatus: 'done', swapSuggested: false });
      continue;
    }
    if (!photo.coordinates || !isValidCoordinate(photo.coordinates.latitude, photo.coordinates.longitude)) {
      byPhotoId.set(photo.id, { coordinateQuality: 'missing', gpsStatus: 'missing', swapSuggested: false });
      continue;
    }

    const confidenceOk = photo.gpsSource === 'exif'
      || (photo.ocrStatus === 'confident' && Number(photo.gpsConfidence) >= 0.68);
    const regionOk = options.regionMode !== 'karelia' || inKarelia(photo.coordinates);
    const distance = cluster ? haversineDistanceMeters(photo.coordinates, cluster) : 0;
    const clusterOk = !cluster || distance <= thresholdMeters;
    const swapped = { latitude: photo.coordinates.longitude, longitude: photo.coordinates.latitude };
    const swappedValid = isValidCoordinate(swapped.latitude, swapped.longitude);
    const swappedDistance = cluster && swappedValid ? haversineDistanceMeters(swapped, cluster) : null;
    const swapSuggested = !clusterOk && swappedDistance !== null && swappedDistance < distance && swappedDistance <= thresholdMeters;
    const confident = confidenceOk && regionOk && clusterOk;
    const lowPrecision = photo.coordinateQuality === 'low_precision'
      || photo.ocrStatus === 'low_precision'
      || (photo.gpsWarnings || []).includes('low_precision_coordinate');

    byPhotoId.set(photo.id, {
      coordinateQuality: lowPrecision && regionOk && clusterOk ? 'low_precision' : confident ? 'confident' : 'suspicious',
      gpsStatus: lowPrecision && regionOk && clusterOk ? 'low_precision' : confident ? 'done' : 'suspicious',
      swapSuggested,
      sanityDistanceMeters: distance,
      sanityReason: lowPrecision && regionOk && clusterOk
        ? 'low_precision_coordinate'
        : !confidenceOk ? 'low_confidence' : !regionOk ? 'outside_expected_region' : !clusterOk ? 'batch_outlier' : null,
    });
  }
  return { cluster, byPhotoId };
}
