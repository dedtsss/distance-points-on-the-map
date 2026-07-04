export const ACCEPTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

export const MAX_PHOTOS = 20;

export function validateSelectedFiles(files) {
  const selected = Array.from(files || []);
  const errors = [];

  if (selected.length > MAX_PHOTOS) {
    errors.push(`Можно выбрать не более ${MAX_PHOTOS} фотографий за один раз.`);
  }

  const validFiles = selected.slice(0, MAX_PHOTOS).filter((file) => {
    if (!file || file.size <= 0) {
      errors.push(`${file?.name || 'Файл'}: файл пустой.`);
      return false;
    }

    const type = String(file.type || '').toLowerCase();
    const supportedExtension = /\.(jpe?g|png|webp)$/i.test(String(file.name || ''));
    if (!ACCEPTED_IMAGE_TYPES.has(type) && !supportedExtension) {
      errors.push(`${file.name}: поддерживаются JPG, PNG и WebP.`);
      return false;
    }

    return true;
  });

  return { validFiles, errors };
}
