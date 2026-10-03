import exifr from 'exifr';

const isFiniteCoordinate = (value) => Number.isFinite(Number(value));
const toNumber = (value) => Number(value);

const isZeroLikeCoordinate = (latitude, longitude) => {
  const lat = Number(latitude);
  const lon = Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) < 0.000001 && Math.abs(lon) < 0.000001;
};

const isValidGpsPair = (latitude, longitude) => {
  const lat = Number(latitude);
  const lon = Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return false;
  }

  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return false;
  }

  // Для реальных пользовательских фото 0,0 почти всегда означает пустую/битую геометку,
  // а не точку в Гвинейском заливе. Не показываем такие координаты как найденный GPS.
  if (isZeroLikeCoordinate(lat, lon)) {
    return false;
  }

  return true;
};

const coordinateFromDms = (value, ref) => {
  if (!Array.isArray(value) || value.length < 3) {
    return null;
  }

  const [degrees, minutes, seconds] = value.map(Number);

  if (![degrees, minutes, seconds].every(Number.isFinite)) {
    return null;
  }

  if (degrees === 0 && minutes === 0 && seconds === 0) {
    return null;
  }

  let result = Math.abs(degrees) + minutes / 60 + seconds / 3600;
  const normalizedRef = String(ref || '').toUpperCase();

  if (normalizedRef === 'S' || normalizedRef === 'W' || degrees < 0) {
    result *= -1;
  }

  return result;
};

const normalizeGps = (gps) => {
  if (!gps || typeof gps !== 'object') {
    return null;
  }

  const directLatitude = gps.latitude ?? gps.Latitude;
  const directLongitude = gps.longitude ?? gps.Longitude;

  if (isValidGpsPair(directLatitude, directLongitude)) {
    return {
      latitude: toNumber(directLatitude),
      longitude: toNumber(directLongitude),
    };
  }

  const dmsLatitude = coordinateFromDms(gps.GPSLatitude, gps.GPSLatitudeRef);
  const dmsLongitude = coordinateFromDms(gps.GPSLongitude, gps.GPSLongitudeRef);

  if (isValidGpsPair(dmsLatitude, dmsLongitude)) {
    return {
      latitude: toNumber(dmsLatitude),
      longitude: toNumber(dmsLongitude),
    };
  }

  return null;
};

export async function readPhotoExif(file) {
  let orientation = 1;

  try {
    orientation = await exifr.orientation(file).catch(() => 1);

    const gps = await exifr.gps(file).catch(() => null);
    let coordinates = normalizeGps(gps);

    if (!coordinates) {
      const parsed = await exifr.parse(file, {
        gps: true,
        tiff: true,
        ifd0: true,
        translateValues: false,
        reviveValues: true,
      }).catch(() => null);

      coordinates = normalizeGps(parsed);
    }

    if (!coordinates) {
      return {
        gpsStatus: 'missing',
        gpsStatusText: 'GPS отсутствует или координаты не распознаны',
        coordinates: null,
        orientation: orientation || 1,
        exifError: null,
      };
    }

    return {
      gpsStatus: 'found',
      gpsStatusText: 'GPS найден',
      coordinates,
      orientation: orientation || 1,
      exifError: null,
    };
  } catch (error) {
    return {
      gpsStatus: 'error',
      gpsStatusText: 'Ошибка чтения EXIF',
      coordinates: null,
      orientation: orientation || 1,
      exifError: error instanceof Error ? error.message : 'Неизвестная ошибка EXIF',
    };
  }
}
