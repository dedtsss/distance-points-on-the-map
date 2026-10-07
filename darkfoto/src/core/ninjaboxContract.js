export const MAX_POINT_FILES = 100;
export const MAX_JPEG_BYTES = 25 * 1024 * 1024;
export const MAX_POINT_BYTES = 100 * 1024 * 1024;
export const validPhotoUrl = (url) => /^https:\/\/ninjabox\.org\/i\/[a-zA-Z0-9_-]+$/.test(url || '');
// Common pages use root UUID paths, distinct from individual /i/ pages.
export const validGalleryUrl = (url) => /^https:\/\/ninjabox\.org\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(url || '');

export function validatePointFiles(files) {
  return files.length > 0 && files.length <= MAX_POINT_FILES
    && files.every((file) => file?.type === 'image/jpeg' && file.size > 0 && file.size <= MAX_JPEG_BYTES)
    && files.reduce((sum, file) => sum + file.size, 0) <= MAX_POINT_BYTES;
}
