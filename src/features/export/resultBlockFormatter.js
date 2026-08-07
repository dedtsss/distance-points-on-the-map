import { photoLinksInRequestedOrder } from '../links/linkFormatter.js';
import {
  normalizeExportDescription,
  normalizeSessionColor,
  normalizeSessionPacking,
} from './exportPreferences.js';

const formattedNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : '';
};

const coordinatesText = (photo) => {
  const latitude = formattedNumber(photo?.coordinates?.latitude ?? photo?.latitude);
  const longitude = formattedNumber(photo?.coordinates?.longitude ?? photo?.longitude);
  return latitude && longitude ? `${latitude}, ${longitude}` : 'не найдены';
};

const compactComment = (value) => normalizeExportDescription(value)
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .join('\n');

export function formatPhotoResultBlock(photo, options = {}) {
  const description = compactComment(options.description);
  const color = normalizeSessionColor(options.color);
  const packing = normalizeSessionPacking(options.packing);
  const index = String(photo?.indexFromOcr || '').trim() || 'не распознан';
  const links = photoLinksInRequestedOrder(photo);
  const photoText = links.length > 0 ? links.join(' ') : 'ссылка отсутствует';

  return [
    `#${index}`,
    `Координаты: ${coordinatesText(photo)}`,
    `Цвет: ${color || 'не указан'}`,
    `Фасовка: ${packing || 'не указана'}`,
    `Фото: ${photoText}`,
    `Комментарий: ${description}`,
  ].join('\n');
}

export function buildPhotoResultBlocks(photos, options = {}) {
  return (photos || []).map((photo) => ({
    photoId: photo.id || photo.photoId || String(photo.number || ''),
    photoNumber: Number(photo.number) || 0,
    text: formatPhotoResultBlock(photo, options),
  }));
}

export function formatAllPhotoResultBlocks(photos, options = {}) {
  return buildPhotoResultBlocks(photos, options)
    .map((block) => block.text)
    .filter(Boolean)
    .join('\n\n');
}
