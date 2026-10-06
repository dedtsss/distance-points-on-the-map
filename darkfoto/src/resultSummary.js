import { formatAllPhotoResultBlocks } from './core/features/export/resultBlockFormatter.js';
import { formatDistanceMeters, haversineDistanceMeters } from './core/utils/geoDistance.js';

const byPhotoOrder = (left, right) => (
  (Number(left?.number) || Number.MAX_SAFE_INTEGER) - (Number(right?.number) || Number.MAX_SAFE_INTEGER)
  || String(left?.id || '').localeCompare(String(right?.id || ''))
);

export function buildDistancePairs(photos = [], thresholdMeters = 25) {
  const threshold = Number.isFinite(Number(thresholdMeters)) ? Number(thresholdMeters) : 25;
  const points = [...photos].filter((photo) => photo?.coordinates && photo?.indexFromOcr)
    .sort(byPhotoOrder);
  const pairs = [];
  for (let left = 0; left < points.length; left += 1) {
    for (let right = left + 1; right < points.length; right += 1) {
      const distanceMeters = haversineDistanceMeters(points[left], points[right]);
      if (distanceMeters === null) continue;
      pairs.push({
        pointA: points[left],
        pointB: points[right],
        distanceMeters,
        thresholdMeters: threshold,
        tooClose: distanceMeters < threshold,
      });
    }
  }
  return pairs;
}

export const formatDistancePair = (pair) => {
  const distance = formatDistanceMeters(pair.distanceMeters);
  const warning = pair.tooClose ? ` · ближе ${formatDistanceMeters(pair.thresholdMeters)} м` : '';
  return `#${pair.pointA.indexFromOcr} ↔ #${pair.pointB.indexFromOcr}: ${distance} м${warning}`;
};

export function buildResultText({ grouped, formatOptions = {}, session = '', reviewLabels = {} }) {
  if (!grouped) return '';
  const main = formatAllPhotoResultBlocks(grouped.main || [], formatOptions);
  const reserve = formatAllPhotoResultBlocks(grouped.reserve || [], formatOptions);
  const review = (grouped.unresolved || [])
    .map((photo) => `${photo.fileName}: ${reviewLabels[photo.reviewReason] || photo.reviewReason}`)
    .join('\n');
  const sessionHeader = String(session || '').trim() ? `Сессия: ${String(session).trim()}\n\n` : '';
  return `${sessionHeader}Основные\n\n${main}\n\nРезерв\n\n${reserve}\n\nТребует проверки\n\n${review}\n`;
}
