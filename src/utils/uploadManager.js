import { cleanImageForUpload } from './imageCleaner';
import { uploadPhotoBundleViaProxy } from './uploadProxy';

export const PROVIDER_LABELS = {
  freeimage: 'Freeimage',
  ninjabox: 'Ninjabox',
  x0: 'x0.at',
};

const CLEAN_METHOD_LABELS = {
  'binary-jpeg-strip': 'binary JPEG strip',
  'canvas-fallback': 'Canvas fallback',
  failed: 'ошибка очистки',
};

const cleanStatusText = (cleaned) => {
  if (!cleaned.ok) return 'Ошибка очистки изображения';
  const method = CLEAN_METHOD_LABELS[cleaned.method] || cleaned.method || 'unknown';
  const verified = cleaned.verification?.checked ? 'metadata проверены' : 'metadata не проверены';
  return `Метаданные очищены (${method}, ${verified})`;
};

const withTimeout = async (operation, timeoutMs) => {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await operation(controller.signal);
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Тайм-аут загрузки: Worker или фотохостинг не ответил вовремя');
    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
};

const providerErrors = (providers = {}) => Object.entries(providers)
  .filter(([, result]) => result && result.ok === false)
  .map(([provider, result]) => `${PROVIDER_LABELS[provider] || provider}: ${result.error || 'ошибка загрузки'}`);

export async function uploadPhotosWithRedundancy({
  photos,
  proxyUrl,
  timeoutMs = 180_000,
  onPhotoUpdate,
}) {
  if (!proxyUrl?.trim()) throw new Error('URL Worker-прокси не настроен');

  const cleanedEntries = [];
  const errors = [];
  let cleanFailedCount = 0;

  for (const photo of photos) {
    onPhotoUpdate(photo.id, {
      uploadStatus: 'Готовится очищенная копия',
      uploadError: '',
      uploadWarnings: [],
      uploadLinks: [],
      imageUrl: '',
      uploadProviderResults: null,
    });

    const preferredFilename = `gps-${String(photo.number).padStart(3, '0')}.jpg`;
    const cleaned = await cleanImageForUpload(photo.file, photo.orientation, preferredFilename);
    onPhotoUpdate(photo.id, {
      cleanStatus: cleanStatusText(cleaned),
      cleanWarnings: cleaned.warnings,
      cleanMethod: cleaned.method,
      metadataRemoved: cleaned.metadataRemoved,
      cleanVerification: cleaned.verification,
      uploadFilename: cleaned.filename,
    });

    if (!cleaned.ok || cleaned.verification?.hasGps === true) {
      const message = cleaned.verification?.hasGps === true
        ? `После очистки в файле остался GPS metadata: Фото №${photo.number}`
        : `Ошибка очистки изображения: Фото №${photo.number}`;
      cleanFailedCount += 1;
      errors.push(message);
      onPhotoUpdate(photo.id, { uploadStatus: 'Ошибка очистки', uploadError: message });
      continue;
    }

    cleanedEntries.push({ photoId: photo.id, file: cleaned.file });
    onPhotoUpdate(photo.id, { uploadStatus: 'Ожидает batch-загрузки' });
  }

  if (cleanedEntries.length === 0) {
    return { completeCount: 0, partialCount: 0, failedCount: cleanFailedCount, errors };
  }

  for (const entry of cleanedEntries) onPhotoUpdate(entry.photoId, { uploadStatus: 'Загрузка в Freeimage и Ninjabox...' });
  const bundle = await withTimeout(
    (signal) => uploadPhotoBundleViaProxy(cleanedEntries, proxyUrl, signal),
    timeoutMs,
  );

  const itemsByPhotoId = new Map(bundle.items.map((item) => [item.photoId, item]));
  let completeCount = 0;
  let partialCount = 0;
  let uploadFailedCount = 0;

  for (const entry of cleanedEntries) {
    const item = itemsByPhotoId.get(entry.photoId);
    const links = Array.isArray(item?.links) ? item.links : [];
    const failures = providerErrors(item?.providers);
    const fallback = links.find((link) => link.provider === 'x0');
    const warnings = [
      ...(fallback ? [`Использован резервный x0.at вместо: ${(fallback.replaces || []).map((name) => PROVIDER_LABELS[name] || name).join(', ')}`] : []),
      ...failures,
    ];

    if (links.length >= 2) completeCount += 1;
    else if (links.length === 1) partialCount += 1;
    else uploadFailedCount += 1;

    const mainUrl = links[0]?.url || '';
    onPhotoUpdate(entry.photoId, {
      uploadStatus: links.length >= 2 ? 'Загружено: 2 ссылки' : links.length === 1 ? 'Частично: 1 ссылка' : 'Ошибка загрузки',
      uploadError: links.length === 0 ? failures.join('; ') || 'Фотохостинги не вернули ссылку' : '',
      uploadWarnings: warnings,
      uploadLinks: links,
      uploadProviderResults: item?.providers || null,
      ninjaboxGalleryUrl: bundle.ninjaboxGalleryUrl || '',
      imageUrl: mainUrl,
    });

    if (links.length < 2) errors.push(`Фото ${entry.photoId}: получено ссылок ${links.length} из 2`);
  }

  return {
    completeCount,
    partialCount,
    failedCount: cleanFailedCount + uploadFailedCount,
    errors,
    ninjaboxGalleryUrl: bundle.ninjaboxGalleryUrl || null,
  };
}
