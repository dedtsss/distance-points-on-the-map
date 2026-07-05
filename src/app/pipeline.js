import { PHOTO_STATUS, releasePhotoBuffers } from './appState.js';
import { cleanImageForUpload } from '../features/cleanup/cleanImageForUpload.js';
import { calculateDistances } from '../features/distance/distanceService.js';
import { readGpsPipeline } from '../features/gps/readGpsPipeline.js';
import { validateCoordinateBatch } from '../features/gps/coordinateSanity.js';
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
  const stages = { gps: true, cleanup: true, upload: true, ...options.stages };
  const jobs = new Map(options.photos.map((photo) => [photo.id, { ...photo }]));
  const log = (message, photoId = null, type = 'info') => options.onLog?.({ message, photoId, type });

  const patchPhoto = (photoId, patch) => {
    const next = { ...jobs.get(photoId), ...patch };
    jobs.set(photoId, next);
    options.onPhotoUpdate?.(photoId, patch);
    return next;
  };

  if (stages.gps) for (const initialPhoto of options.photos) {
    log(`OCR started: фото ${initialPhoto.number}`, initialPhoto.id);
    patchPhoto(initialPhoto.id, {
      status: PHOTO_STATUS.READING_GPS,
      statusText: 'Поиск координат',
      gpsStatus: 'processing',
      userError: '',
    });

    try {
      const gps = await readGps(jobs.get(initialPhoto.id).stableFile, {
        debug: options.debug === true,
        onProgress: (progress) => {
          patchPhoto(initialPhoto.id, { statusText: progressText(progress) });
          if (String(progress.status).startsWith('cropping:')) log(`OCR ${progress.status.replace('cropping:', '')}`, initialPhoto.id);
          if (String(progress.status).startsWith('overlay:')) log(`Overlay ROI: ${progress.status.endsWith('found') && !progress.status.endsWith('not_found') ? 'найден' : 'не найден'}`, initialPhoto.id);
        },
      });
      const foundPatch = gps.found ? {
        status: PHOTO_STATUS.GPS_DONE,
        statusText: 'Координаты найдены',
        gpsStatus: 'done',
        coordinates: gps.coordinates,
        latitude: gps.coordinates.latitude,
        longitude: gps.coordinates.longitude,
        gpsSource: gps.source,
        gpsConfidence: gps.confidence ?? (gps.source === 'exif' ? 1 : 0),
        ocrStatus: gps.ocrStatus || (gps.source === 'exif' ? 'exif' : 'uncertain'),
        manualCoordinates: false,
        coordinateQuality: gps.source === 'exif' || gps.ocrStatus === 'confident' ? 'confident' : 'suspicious',
        ocrAttemptCount: gps.ocrAttemptCount || 0,
      } : {
        status: PHOTO_STATUS.GPS_MISSING,
        statusText: 'Координаты не найдены',
        gpsStatus: 'missing',
        coordinates: null,
        latitude: null,
        longitude: null,
        gpsSource: null,
        gpsConfidence: gps.confidence || 0,
        ocrStatus: gps.ocrStatus || 'missing',
        manualCoordinates: false,
        coordinateQuality: gps.ocrStatus === 'suspect' ? 'suspicious' : 'missing',
        ocrAttemptCount: gps.ocrAttemptCount || 0,
      };
      patchPhoto(initialPhoto.id, {
        ...foundPatch,
        orientation: gps.orientation || 1,
        debug: { ...jobs.get(initialPhoto.id).debug, gps: gps.debug },
      });
      log(gps.found ? `OCR/EXIF result: ${gps.coordinates.latitude}, ${gps.coordinates.longitude}` : 'Координаты не найдены', initialPhoto.id, gps.found ? 'success' : 'warning');
    } catch (error) {
      patchPhoto(initialPhoto.id, {
        status: PHOTO_STATUS.GPS_MISSING,
        statusText: 'Координаты не найдены',
        gpsStatus: 'missing',
        coordinates: null,
        latitude: null,
        longitude: null,
        gpsSource: null,
        gpsConfidence: 0,
        ocrStatus: 'error',
        manualCoordinates: false,
        coordinateQuality: 'missing',
        debug: {
          ...jobs.get(initialPhoto.id).debug,
          gpsError: technicalErrorMessage(error),
        },
      });
    }
  }

  let distanceResult = calculate([...jobs.values()], options.thresholdMeters);
  if (stages.gps) {
    const sanity = validateCoordinateBatch([...jobs.values()], { regionMode: options.regionMode });
    for (const photo of [...jobs.values()]) {
      const sanityPatch = sanity.byPhotoId.get(photo.id) || {};
      patchPhoto(photo.id, sanityPatch);
      if (sanityPatch.coordinateQuality === 'suspicious') log('OCR result rejected: suspicious coordinates', photo.id, 'warning');
    }
    const gpsReadyPhotos = [...jobs.values()];
    distanceResult = calculate(gpsReadyPhotos, options.thresholdMeters);
    gpsReadyPhotos.forEach((photo) => {
    const result = distanceResult.byPhotoId.get(photo.id) || {
      distanceStatus: 'missing_coordinates',
      distanceConflicts: [],
    };
    patchPhoto(photo.id, {
      status: PHOTO_STATUS.DISTANCE_READY,
      statusText: photo.coordinateQuality === 'suspicious'
        ? 'Координаты подозрительные — нужна проверка'
        : photo.coordinates ? 'Расстояния рассчитаны' : 'Без расчёта расстояний',
      ...result,
    });
    });
  }

  const cleanedEntries = [];
  if (stages.cleanup) for (const photo of [...jobs.values()]) {
    log(`Cleanup started: фото ${photo.number}`, photo.id);
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
      log(`Cleanup done: фото ${photo.number}`, photo.id, 'success');
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

  if (!stages.cleanup && stages.upload) {
    for (const photo of [...jobs.values()]) {
      if (!photo.cleanedBlob) continue;
      cleanedEntries.push({ photoId: photo.id, file: photo.cleanedBlob, originalFile: photo.stableFile, cleaned: true });
    }
  }

  if (stages.upload && cleanedEntries.length > 0) {
    const selectedProviders = ['freeimage', 'ninjabox'].filter((provider) => options.providerSettings?.[provider] !== false);
    cleanedEntries.forEach((entry) => selectedProviders.forEach((provider) => log(`Upload ${provider}: started`, entry.photoId)));
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
        for (const provider of selectedProviders) {
          log(`Upload ${provider}: ${result.links.some((link) => link.provider === provider) ? 'done' : 'error'}`, entry.photoId, result.links.some((link) => link.provider === provider) ? 'success' : 'error');
        }
        if (result.links.some((link) => link.provider === 'x0')) log('Upload x0 fallback: done', entry.photoId, 'success');
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
