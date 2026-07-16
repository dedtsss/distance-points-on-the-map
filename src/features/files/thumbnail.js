export const THUMBNAIL_MAX_SIDE = 320;
export const MAX_SESSION_THUMBNAIL_LENGTH = 180_000;

const loadImage = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    URL.revokeObjectURL(url);
    resolve(image);
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error('thumbnail_decode_failed'));
  };
  image.src = url;
});

export async function createLightweightThumbnail(file, maxSide = THUMBNAIL_MAX_SIDE) {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null;
  const image = await loadImage(file);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) throw new Error('thumbnail_dimensions_missing');

  const scale = Math.min(1, maxSide / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('thumbnail_canvas_unavailable');

  context.fillStyle = '#eef2f7';
  context.fillRect(0, 0, targetWidth, targetHeight);
  context.drawImage(image, 0, 0, targetWidth, targetHeight);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
  return dataUrl.length <= MAX_SESSION_THUMBNAIL_LENGTH ? dataUrl : null;
}
