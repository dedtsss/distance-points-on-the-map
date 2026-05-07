import exifr from 'exifr';

export async function readPhotoExif(file) {
  try {
    const gps = await exifr.gps(file);
    const orientation = await exifr.orientation(file).catch(() => 1);

    if (!gps || typeof gps.latitude !== 'number' || typeof gps.longitude !== 'number') {
      return {
        gpsStatus: 'missing',
        gpsStatusText: 'GPS отсутствует',
        coordinates: null,
        orientation: orientation || 1,
        exifError: null,
      };
    }

    return {
      gpsStatus: 'found',
      gpsStatusText: 'GPS найден',
      coordinates: {
        latitude: gps.latitude,
        longitude: gps.longitude,
      },
      orientation: orientation || 1,
      exifError: null,
    };
  } catch (error) {
    return {
      gpsStatus: 'error',
      gpsStatusText: 'Ошибка чтения EXIF',
      coordinates: null,
      orientation: 1,
      exifError: error instanceof Error ? error.message : 'Неизвестная ошибка EXIF',
    };
  }
}
