import { cleanImageForUpload } from './imageCleaner';
import { uploadCatbox } from './uploadCatbox';
import { uploadImgBB } from './uploadImgBB';

export const HOSTING_LABELS = {
  catbox: 'Catbox',
  imgbb: 'ImgBB',
};

const withTimeout = async (operation, timeoutMs) => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await operation(controller.signal);
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('upload_timeout');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

export async function uploadPhotosSequentially({
  photos,
  hosting,
  imgbbApiKey,
  timeoutMs = 12000,
  onPhotoUpdate,
}) {
  if (hosting === 'imgbb' && !imgbbApiKey.trim()) {
    throw new Error('Укажите API ключ ImgBB');
  }

  let uploadedCount = 0;

  for (const photo of photos) {
    onPhotoUpdate(photo.id, {
      uploadStatus: 'Готовится очищенная копия',
      uploadError: '',
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
        return uploadImgBB(cleaned.file, imgbbApiKey, signal);
      }, timeoutMs);

      uploadedCount += 1;
      onPhotoUpdate(photo.id, {
        uploadStatus: 'Загружено',
        uploadedUrl,
        uploadError: '',
      });
    } catch (error) {
      onPhotoUpdate(photo.id, {
        uploadStatus: 'Ошибка загрузки',
        uploadError: error instanceof Error ? error.message : 'Неизвестная ошибка загрузки',
      });
      const hostName = HOSTING_LABELS[hosting];
      throw new Error(
        `Ошибка загрузки. Хостинг ${hostName} не отвечает или нестабилен. Успешно загружено: ${uploadedCount} из ${photos.length}.`,
      );
    }
  }

  return uploadedCount;
}
