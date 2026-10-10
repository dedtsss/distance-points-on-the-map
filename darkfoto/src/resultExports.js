import { activePoints } from './pointState.js';
import { buildPhotoResultBlocks, normalizeSessionName } from './core/features/export/resultBlockFormatter.js';

const byPhotoOrder = (left, right) => (
  (Number(left?.number) || Number.MAX_SAFE_INTEGER) - (Number(right?.number) || Number.MAX_SAFE_INTEGER)
  || String(left?.id || '').localeCompare(String(right?.id || ''))
);

export function validResultPhotos(grouped) {
  return activePoints([...(grouped?.main || []), ...(grouped?.reserve || [])])
    .filter((photo) => photo?.indexFromOcr && photo?.coordinates
      && Number.isFinite(Number(photo.coordinates.latitude))
      && Number.isFinite(Number(photo.coordinates.longitude))
      && Math.abs(Number(photo.coordinates.latitude)) <= 90
      && Math.abs(Number(photo.coordinates.longitude)) <= 180)
    .sort(byPhotoOrder);
}

export function resultBlocksForCopy(grouped, options = {}) {
  return buildPhotoResultBlocks(validResultPhotos(grouped), options).map((block) => block.text);
}

const xml = (value) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
  .replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
})[character]);
const decimal = (value) => Number(value).toFixed(10).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');

export function buildGpx(grouped, session = '') {
  const suffix = normalizeSessionName(session);
  const reserveIds = new Set((grouped?.reserve || []).map((photo) => photo.id));
  const points = validResultPhotos(grouped).map((photo) => {
    const name = `#${photo.indexFromOcr}${suffix ? ` / ${suffix}` : ''}`;
    const description = `${reserveIds.has(photo.id) ? 'Резерв' : 'Основное'} · ${photo.fileName || ''}`;
    return `  <wpt lat="${decimal(photo.coordinates.latitude)}" lon="${decimal(photo.coordinates.longitude)}"><name>${xml(name)}</name><desc>${xml(description)}</desc></wpt>`;
  });
  return ['<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="DarkCat Photo" xmlns="http://www.topografix.com/GPX/1/1">',
    ...points, '</gpx>', ''].join('\n');
}

// A separately shared point may be removed or awaiting index review.
export const hasPointCoordinates = (point) => point?.coordinates
  && point.coordinates.latitude !== null && point.coordinates.longitude !== null
  && Number.isFinite(Number(point.coordinates.latitude))
  && Number.isFinite(Number(point.coordinates.longitude))
  && Math.abs(Number(point.coordinates.latitude)) <= 90
  && Math.abs(Number(point.coordinates.longitude)) <= 180;

export function buildPointGpx(point, session = '') {
  if (!hasPointCoordinates(point)) throw new Error('Координаты не найдены');
  const identity = point.indexFromOcr || point.id || point.number;
  return buildGpx({ main: [{ ...point, removed: false, indexFromOcr: identity }], reserve: [] }, session);
}
