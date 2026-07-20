import { photoLinksInRequestedOrder } from '../links/linkFormatter.js';
import { normalizeExportDescription, normalizeSessionColor } from './exportPreferences.js';

const formattedNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : '';
};

const coordinatesText = (photo) => {
  const latitude = formattedNumber(photo?.coordinates?.latitude ?? photo?.latitude);
  const longitude = formattedNumber(photo?.coordinates?.longitude ?? photo?.longitude);
  return latitude && longitude ? `${latitude}, ${longitude}` : 'не найдены';
};

export function formatPhotoResultBlock(photo, options = {}) {
  const description = normalizeExportDescription(options.description).trim();
  const color = normalizeSessionColor(options.color);
  const index = String(photo?.indexFromOcr || '').trim() || 'не распознан';
  const links = photoLinksInRequestedOrder(photo);
  const lines = [];

  if (description) {
    lines.push(description, '');
  }

  lines.push(
    `Цвет: ${color || 'не указан'}`,
    `Индекс: ${index}`,
    `Координаты: ${coordinatesText(photo)}`,
  );

  if (links.length === 0) {
    lines.push('Фото: ссылка отсутствует');
  } else {
    links.forEach((url, indexPosition) => {
      lines.push(indexPosition === 0 ? `Фото: ${url}` : `Фото ${indexPosition + 1}: ${url}`);
    });
  }

  return lines.join('\n');
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
