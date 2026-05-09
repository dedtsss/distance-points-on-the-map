import exifr from 'exifr';

const isFiniteCoordinate = (value) => Number.isFinite(Number(value));

const toNumber = (value) => Number(value);

const coordinateFromDms = (value, ref) => {
  if (!Array.isArray(value) || value.length < 3) {
    return null;
  }

  const [degrees, minutes, seconds] = value.map(Number);

  if (![degrees, minutes, seconds].every(Number.isFinite)) {
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

  if (isFiniteCoordinate(directLatitude) && isFiniteCoordinate(directLongitude)) {
    return {
      latitude: toNumber(directLatitude),
      longitude: toNumber(directLongitude),
    };
  }

  const dmsLatitude = coordinateFromDms(gps.GPSLatitude, gps.GPSLatitudeRef);
  const dmsLongitude = coordinateFromDms(gps.GPSLongitude, gps.GPSLongitudeRef);

  if (isFiniteCoordinate(dmsLatitude) && isFiniteCoordinate(dmsLongitude)) {
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
