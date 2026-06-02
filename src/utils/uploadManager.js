import { cleanImageForUpload } from './imageCleaner';
import { uploadCatbox } from './uploadCatbox';
import { uploadViaProxy } from './uploadProxy';

export const HOSTING_LABELS = {
  imgbb: 'ImgBB через прокси',
  allwebsproxy: 'Allwebs через прокси (legacy)',
  catbox: 'Catbox',
  umbproxy: 'UMBPhotos через прокси',
  ninjaproxy: 'NinjaBox через прокси',
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
  if ((hosting === 'imgbb' || hosting === 'allwebsproxy' || hosting === 'umbproxy' || hosting === 'ninjaproxy') && !proxyUrl.trim()) {
    throw new Error('Укажите URL прокси-загрузчика');
  }

  let uploadedCount = 0;

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
      cleanStatus: cleaned.ok ? 'Метаданные очищены' : 'Ошибка очистки изображения',
      cleanWarnings: cleaned.warnings,
      uploadFilename: cleaned.filename,
    });

    if (!cleaned.ok) {
      throw new Error(`Ошибка очистки изображения: Фото №${photo.number}`);
    }

    onPhotoUpdate(photo.id, { uploadStatus: 'Загрузка...' });

    try {
      const uploadedUrl = await withTimeout((signal) => {
        if (hosting === 'catbox') {
          return uploadCatbox(cleaned.file, signal);
        }

        if (hosting === 'imgbb') {
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
      onPhotoUpdate(photo.id, {
        uploadStatus: 'Ошибка загрузки',
        uploadError: details,
      });
      const hostName = HOSTING_LABELS[hosting];
      throw new Error(
        `Ошибка загрузки фото №${photo.number} через ${hostName}. Успешно загружено: ${uploadedCount} из ${photos.length}. Причина: ${details}`,
      );
    }
  }

  return uploadedCount;
}
