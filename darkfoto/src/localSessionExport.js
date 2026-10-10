import { activePoints } from './pointState.js';
import { pointMembers } from './core/photoPoints.js';
import { splitBatch } from './core/batch.js';
import { cleanImageForUpload } from './core/features/cleanup/cleanImageForUpload.js';

export const safeDirectory = (value, fallback = 'session') => String(value || '').normalize('NFC').trim()
  .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '_').replace(/\s+/g, '_')
  .replace(/^[. _]+|[. _]+$/g, '').slice(0, 64) || fallback;

export function localSessionPlan(rows, metadata = {}) {
  const points = activePoints(rows);
  if (!points.length) throw new Error('Нет активных точек для экспорта.');
  const grouped = splitBatch(points);
  const states = new Map([['Основное', grouped.main], ['Резерв', grouped.reserve], ['Требует проверки', grouped.unresolved]]
    .flatMap(([status, items]) => items.map((point) => [point.id, status])));
  const used = new Set();
  return {
    sessionName: safeDirectory(metadata.session, 'DarkCat_Photo'),
    points: points.map((point) => {
      const base = safeDirectory(point.indexFromOcr || `point-${point.number}`, 'point');
      let directory = base, suffix = 2;
      while (used.has(directory.toLocaleLowerCase('ru'))) directory = `${base}-${suffix++}`;
      used.add(directory.toLocaleLowerCase('ru'));
      const members = [...pointMembers(point)].sort((a, b) => a.number - b.number || String(a.id).localeCompare(String(b.id)));
      if (!members.length) throw new Error('Активная точка не содержит фото.');
      const photos = members.map((member, index) => ({ member, filename: `${directory}-${String(index + 1).padStart(2, '0')}.jpg` }));
      const text = [
        `Точка: ${point.indexFromOcr ? `#${point.indexFromOcr}` : point.number}`,
        `Идентификатор: ${point.id}`, `Статус: ${states.get(point.id)}`,
        `Координаты: ${point.coordinates ? `${point.coordinates.latitude}, ${point.coordinates.longitude}` : 'не найдены'}`,
        `Фото: ${photos.length}`,
        ...[['Сессия', metadata.session], ['Цвет', metadata.color], ['Фасовка', metadata.packing], ['Комментарий', metadata.comment]]
          .filter(([, value]) => String(value || '').trim()).map(([label, value]) => `${label}: ${String(value).trim()}`),
        '', 'Локальные файлы:', ...photos.map(({ filename }) => filename), '',
      ].join('\n');
      return { directory, photos, filename: `${directory}.txt`, text };
    }),
  };
}

const base64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1]);
  reader.onerror = () => reject(new Error('Не удалось прочитать очищенную копию.'));
  reader.readAsDataURL(blob);
});

// The native adapter writes only these cleaned bytes; originals/EXIF never
// cross this export bridge. Only one image is decoded/transferred at a time.
export async function exportLocalSession(rows, metadata, { destination, fileAt, clean = cleanImageForUpload,
  encode = base64, onProgress = () => {}, onCommit = () => {} }) {
  const plan = localSessionPlan(rows, metadata);
  const count = plan.points.reduce((total, point) => total + point.photos.length + 1, 0);
  const { token } = await destination.begin({ sessionName: plan.sessionName, expectedFiles: count });
  let completed = 0;
  try {
    for (const point of plan.points) {
      for (const { member, filename } of point.photos) {
        onProgress(completed, count);
        const original = await fileAt(member.number - 1);
        const cleaned = await clean(original, { orientation: member.orientation, preferredFilename: filename });
        if (!cleaned.ok || !cleaned.file || cleaned.file.type !== 'image/jpeg') {
          throw new Error(`Фото ${filename}: ${cleaned.error || 'очистка metadata не пройдена'}`);
        }
        await destination.stage({ token, path: `${point.directory}/${filename}`, mime: 'image/jpeg', data: await encode(cleaned.file) });
        completed++; onProgress(completed, count);
      }
      await destination.stage({ token, path: `${point.directory}/${point.filename}`, mime: 'text/plain',
        data: await encode(new Blob([point.text], { type: 'text/plain;charset=utf-8' })) });
      completed++; onProgress(completed, count);
    }
    onCommit();
    return await destination.commit({ token });
  } catch (error) {
    try { await destination.abort({ token }); } catch { /* Native commit reports any external cleanup failure. */ }
    throw error;
  }
}
