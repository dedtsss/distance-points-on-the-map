import { cleanImageForUpload } from './imageCleaner';
import { uploadCatbox } from './uploadCatbox';
import { uploadViaProxy } from './uploadProxy';

export const HOSTING_LABELS = {
  imgbbproxy: 'ImgBB через прокси',
  allwebsproxy: 'Allwebs через прокси (legacy)',
  catbox: 'Catbox',
  umbproxy: 'UMBPhotos через прокси',
  ninjaproxy: 'NinjaBox через прокси',
};

const CLEAN_METHOD_LABELS = {
  'binary-jpeg-strip': 'binary JPEG strip',
  'canvas-fallback': 'Canvas fallback',
  failed: 'ошибка очистки',
};

const cleanStatusText = (cleaned) => {
  if (!cleaned.ok) {
    return 'Ошибка очистки изображения';
  }

  const method = CLEAN_METHOD_LABELS[cleaned.method] || cleaned.method || 'unknown';
  const verified = cleaned.verification?.checked
    ? 'metadata проверены'
    : 'metadata не проверены';
  return `Метаданные очищены (${method}, ${verified})`;
};

const withTimeout = async (operation, timeoutMs) => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await operation(controller.signal);
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Тайм-аут загрузки: хостинг или прокси не ответил вовремя');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

export async function uploadPhotosSequentially({
  photos,
  hosting,
  proxyUrl,
  timeoutMs = 12000,
  onPhotoUpdate,
}) {
  if ((hosting === 'imgbbproxy' || hosting === 'allwebsproxy' || hosting === 'umbproxy' || hosting === 'ninjaproxy') && !proxyUrl.trim()) {
    throw new Error('Укажите URL прокси-загрузчика');
  }

  let uploadedCount = 0;
  let failedCount = 0;
  const errors = [];

  for (const photo of photos) {
    onPhotoUpdate(photo.id, {
      uploadStatus: 'Готовится очищенная копия',
      uploadError: '',
      imageUrl: '',
      uploadedUrl: '',
      hostingUsed: HOSTING_LABELS[hosting],
    });

    const cleaned = await cleanImageForUpload(photo.file, photo.orientation);

    onPhotoUpdate(photo.id, {
      cleanStatus: cleanStatusText(cleaned),
      cleanWarnings: cleaned.warnings,
      cleanMethod: cleaned.method,
      metadataRemoved: cleaned.metadataRemoved,
      cleanVerification: cleaned.verification,
      uploadFilename: cleaned.filename,
    });

    if (!cleaned.ok || cleaned.verification?.hasGps === true) {
      const details = cleaned.verification?.hasGps === true
        ? `После очистки в файле остался GPS metadata: Фото №${photo.number}`
        : `Ошибка очистки изображения: Фото №${photo.number}`;
      failedCount += 1;
      errors.push(details);
      onPhotoUpdate(photo.id, {
        uploadStatus: 'Ошибка очистки',
        uploadError: details,
      });
      continue;
    }

    onPhotoUpdate(photo.id, { uploadStatus: 'Загрузка...' });

    try {
      const uploadedUrl = await withTimeout((signal) => {
        if (hosting === 'catbox') {
          return uploadCatbox(cleaned.file, signal);
        }

        if (hosting === 'imgbbproxy') {
          return uploadViaProxy(cleaned.file, 'imgbb', proxyUrl, signal);
        }

        if (hosting === 'allwebsproxy') {
          return uploadViaProxy(cleaned.file, 'allwebs', proxyUrl, signal);
        }

        if (hosting === 'umbproxy') {
          return uploadViaProxy(cleaned.file, 'umbphotos', proxyUrl, signal);
        }

        if (hosting === 'ninjaproxy') {
          return uploadViaProxy(cleaned.file, 'ninjabox', proxyUrl, signal);
        }

        throw new Error('Неизвестный хостинг');
      }, timeoutMs);

      uploadedCount += 1;
      onPhotoUpdate(photo.id, {
        uploadStatus: 'Загружено',
        imageUrl: uploadedUrl,
        uploadedUrl,
        uploadError: '',
      });
    } catch (error) {
      const details = error instanceof Error ? error.message : 'Неизвестная ошибка загрузки';
      failedCount += 1;
      errors.push(`Фото №${photo.number}: ${details}`);
      onPhotoUpdate(photo.id, {
        uploadStatus: 'Ошибка загрузки',
        uploadError: details,
      });
    }
  }

  return {
    uploadedCount,
    failedCount,
    errors,
  };
}
