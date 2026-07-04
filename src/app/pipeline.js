import { PHOTO_STATUS, releasePhotoBuffers } from './appState.js';
import { cleanImageForUpload } from '../features/cleanup/cleanImageForUpload.js';
import { calculateDistances } from '../features/distance/distanceService.js';
import { readGpsPipeline } from '../features/gps/readGpsPipeline.js';
import { uploadCleanedPhotos } from '../features/upload/uploadService.js';
import { USER_ERRORS, technicalErrorMessage } from '../utils/errors.js';

const progressText = ({ status, progress }) => {
  const percent = Number(progress) > 0 ? `, ${Math.round(Number(progress) * 100)}%` : '';
  if (String(status).startsWith('recognizing')) return `Распознавание координат${percent}`;
  if (String(status).startsWith('cropping')) return 'Подготовка области с координатами';
  return 'Подготовка OCR';
};

export async function runPhotoPipeline(options) {
  const readGps = options.dependencies?.readGps || readGpsPipeline;
  const calculate = options.dependencies?.calculateDistances || calculateDistances;
  const clean = options.dependencies?.clean || cleanImageForUpload;
  const upload = options.dependencies?.upload || uploadCleanedPhotos;
  const jobs = new Map(options.photos.map((photo) => [photo.id, { ...photo }]));

  const patchPhoto = (photoId, patch) => {
    const next = { ...jobs.get(photoId), ...patch };
    jobs.set(photoId, next);
    options.onPhotoUpdate?.(photoId, patch);
    return next;
  };

  for (const initialPhoto of options.photos) {
    patchPhoto(initialPhoto.id, {
      status: PHOTO_STATUS.READING_GPS,
      statusText: 'Поиск координат',
      gpsStatus: 'processing',
      userError: '',
    });

    try {
      const gps = await readGps(jobs.get(initialPhoto.id).stableFile, {
        debug: options.debug === true,
        onProgress: (progress) => patchPhoto(initialPhoto.id, {
          statusText: progressText(progress),
        }),
      });
      const foundPatch = gps.found ? {
        status: PHOTO_STATUS.GPS_DONE,
        statusText: 'Координаты найдены',
        gpsStatus: 'done',
        coordinates: gps.coordinates,
        latitude: gps.coordinates.latitude,
        longitude: gps.coordinates.longitude,
        gpsSource: gps.source,
      } : {
        status: PHOTO_STATUS.GPS_MISSING,
        statusText: 'Координаты не найдены',
        gpsStatus: 'missing',
        coordinates: null,
        latitude: null,
        longitude: null,
        gpsSource: null,
      };
      patchPhoto(initialPhoto.id, {
        ...foundPatch,
        orientation: gps.orientation || 1,
        debug: { ...jobs.get(initialPhoto.id).debug, gps: gps.debug },
      });
    } catch (error) {
      patchPhoto(initialPhoto.id, {
        status: PHOTO_STATUS.GPS_MISSING,
        statusText: 'Координаты не найдены',
        gpsStatus: 'missing',
        coordinates: null,
        latitude: null,
        longitude: null,
        gpsSource: null,
        debug: {
          ...jobs.get(initialPhoto.id).debug,
          gpsError: technicalErrorMessage(error),
        },
      });
    }
  }

  const gpsReadyPhotos = [...jobs.values()];
  const distanceResult = calculate(gpsReadyPhotos, options.thresholdMeters);
  gpsReadyPhotos.forEach((photo) => {
    const result = distanceResult.byPhotoId.get(photo.id) || {
      distanceStatus: 'missing_coordinates',
      distanceConflicts: [],
    };
    patchPhoto(photo.id, {
      status: PHOTO_STATUS.DISTANCE_READY,
      statusText: photo.coordinates ? 'Расстояния рассчитаны' : 'Без расчёта расстояний',
      ...result,
    });
  });

  const cleanedEntries = [];
  for (const photo of [...jobs.values()]) {
    patchPhoto(photo.id, {
      status: PHOTO_STATUS.CLEANING,
      statusText: 'Очистка metadata',
      cleanupStatus: 'processing',
    });

    try {
      const cleaned = await clean(jobs.get(photo.id).stableFile, {
        orientation: jobs.get(photo.id).orientation,
        preferredFilename: `gps-${String(photo.number).padStart(3, '0')}.jpg`,
        originalName: jobs.get(photo.id).fileName,
        safeName: jobs.get(photo.id).safeName,
        type: jobs.get(photo.id).type,
        size: jobs.get(photo.id).size,
      });
      if (!cleaned.ok || !cleaned.file) {
        patchPhoto(photo.id, {
          status: PHOTO_STATUS.FAILED,
          statusText: 'Фото не загружено',
          cleanupStatus: 'failed',
          uploadStatus: 'skipped',
          userError: USER_ERRORS.CLEANUP_FAILED,
          debug: {
            ...jobs.get(photo.id).debug,
            cleanup: cleaned.debug || null,
            cleanupError: cleaned.error || 'cleanup failed',
          },
        });
        continue;
      }

      patchPhoto(photo.id, {
        status: PHOTO_STATUS.CLEANED,
        statusText: 'Metadata очищены',
        cleanupStatus: 'done',
        cleanedBlob: cleaned.file,
        debug: {
          ...jobs.get(photo.id).debug,
          cleanup: {
            method: cleaned.method,
            verification: cleaned.verification,
            ...cleaned.debug,
          },
        },
      });
      cleanedEntries.push({
        photoId: photo.id,
        file: cleaned.file,
        originalFile: jobs.get(photo.id).stableFile,
        cleaned: true,
      });
    } catch (error) {
      patchPhoto(photo.id, {
        status: PHOTO_STATUS.FAILED,
        statusText: 'Фото не загружено',
        cleanupStatus: 'failed',
        uploadStatus: 'skipped',
        userError: USER_ERRORS.CLEANUP_FAILED,
        debug: {
          ...jobs.get(photo.id).debug,
          cleanupError: technicalErrorMessage(error),
        },
      });
    }
  }

  if (cleanedEntries.length > 0) {
    cleanedEntries.forEach((entry) => patchPhoto(entry.photoId, {
      status: PHOTO_STATUS.UPLOADING,
      statusText: 'Загрузка фотографий',
      uploadStatus: 'processing',
    }));

    try {
      const uploadResults = await upload(cleanedEntries, {
        proxyUrl: options.proxyUrl,
        signal: options.signal,
        providerSettings: options.providerSettings,
      });

      cleanedEntries.forEach((entry) => {
        const result = uploadResults.get(entry.photoId);
        if (!result || result.links.length === 0) {
          patchPhoto(entry.photoId, {
            status: PHOTO_STATUS.FAILED,
            statusText: 'Фото не загружено',
            uploadStatus: 'failed',
            userError: USER_ERRORS.UPLOAD_FAILED,
            uploadResult: result || null,
            debug: {
              ...jobs.get(entry.photoId).debug,
              uploadError: result?.technicalError || 'No upload links returned',
              providerResponses: result?.providerResults || null,
            },
          });
          return;
        }

        patchPhoto(entry.photoId, {
          status: PHOTO_STATUS.UPLOADED,
          statusText: result.complete ? `Загружено: ${result.links.length} ссылок` : `Загружено частично: ${result.links.length}`,
          uploadStatus: result.complete ? 'done' : 'partial',
          uploadResult: result,
          userError: '',
          debug: {
            ...jobs.get(entry.photoId).debug,
            uploadError: result.technicalError || '',
            providerResponses: result.providerResults,
          },
        });
        const released = releasePhotoBuffers(jobs.get(entry.photoId));
        jobs.set(entry.photoId, released);
        options.onPhotoUpdate?.(entry.photoId, {
          sourceBuffer: null,
          stableBlob: null,
          stableFile: null,
          cleanedBlob: null,
          previewObjectUrl: null,
        });
      });
    } catch (error) {
      cleanedEntries.forEach((entry) => patchPhoto(entry.photoId, {
        status: PHOTO_STATUS.FAILED,
        statusText: 'Фото не загружено',
        uploadStatus: 'failed',
        userError: USER_ERRORS.UPLOAD_FAILED,
        debug: {
          ...jobs.get(entry.photoId).debug,
          uploadError: technicalErrorMessage(error),
        },
      }));
    }
  }

  const photos = options.photos.map((photo) => jobs.get(photo.id));
  return {
    photos,
    distanceResult,
    uploadedCount: photos.filter((photo) => photo.uploadResult?.links?.length > 0).length,
    failedCount: photos.filter((photo) => photo.status === PHOTO_STATUS.FAILED).length,
  };
}
