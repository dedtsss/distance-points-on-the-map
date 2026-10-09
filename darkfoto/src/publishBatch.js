import { cleanImageForUpload } from './core/features/cleanup/cleanImageForUpload.js';
import { activePoints } from './pointState.js';
import { pointMembers } from './core/photoPoints.js';
import { publishCleanImage, publishCleanImageToNinjabox, withTimeout } from './core/publisher.js';

const message = (error) => error instanceof Error ? error.message : String(error);
const hasRecognizedIndex = (row) => /^(?:\d{4}|\d{5})$/.test(String(row.indexFromOcr || ''))
  && row.indexStatus === 'found';
export const outgoingName = (row, unresolvedNumber) =>
  hasRecognizedIndex(row)
    ? `${row.indexFromOcr}.jpg` : `NN${String(unresolvedNumber).padStart(2, '0')}.jpg`;

export async function publishBatch(rows, _unresolvedIds, options) {
  const { publisher, destination, fileAt, onStatus = () => {}, onRows = () => {},
    onProgress = () => {}, onCleaned = () => {},
    clean = cleanImageForUpload, publishOnion = publishCleanImage,
    publishNinjabox = publishCleanImageToNinjabox, cleanupTimeoutMs = 35_000 } = options;
  let failures = 0;
  let unresolvedNumber = 0;
  const active = activePoints(rows);
  const eligible = active.map((row, index) => ({ row, index,
    filename: outgoingName(row, hasRecognizedIndex(row) ? unresolvedNumber : ++unresolvedNumber) }))
    .filter(({ row }) => row.uploadResult?.stale || !row.uploadResult?.links?.some((link) => link.provider === publisher && link.url));
  for (const [position, { row, index, filename }] of eligible.entries()) {
    const members = pointMembers(row);
    if (publisher === 'onion' && members.length > 1) {
      throw new Error('Onion публикует одно фото. Разделите многокадровые точки или выберите NinjaBox.');
    }
    const cleaned = [];
    try {
      for (const [memberPosition, member] of members.entries()) {
        onStatus(members.length === 1 ? `Очистка ${index + 1}/${active.length}`
          : `Очистка точки ${index + 1}/${active.length} · фото ${memberPosition + 1}/${members.length}`);
        onProgress('cleanup', index, active.length);
        const memberName = members.length === 1 ? filename
          : filename.replace(/\.jpg$/, `-${String(memberPosition + 1).padStart(2, '0')}.jpg`);
        const file = await withTimeout(async () => {
          const source = await fileAt(Number.isInteger(member.number) ? member.number - 1 : rows.indexOf(row));
          const result = await clean(source, {
            orientation: member.orientation, preferredFilename: memberName,
          });
          if (!result.ok) throw new Error(result.error);
          return result.file;
        }, cleanupTimeoutMs, 'Очистка');
        cleaned.push(file);
        onCleaned(member, file);
      }
    } catch (error) {
      row.publishError = `Очистка: ${message(error)}`;
      failures++;
      await onRows([...rows]);
      continue;
    }
    onStatus(`${publisher === 'ninjabox' ? 'NinjaBox' : 'Onion'} ${index + 1}/${active.length}`);
    onProgress(publisher, index, active.length);
    try {
      const url = publisher === 'onion'
        ? await publishOnion(cleaned[0], destination)
        : await publishNinjabox(cleaned.length === 1 ? cleaned[0] : cleaned, destination, {
          onProgress: (loaded, total) => onProgress('ninjabox', index, active.length,
            total > 0 ? loaded / total : null),
        });
      row.uploadResult ||= { links: [] };
      row.uploadResult.links = [{ provider: publisher, url }];
      delete row.uploadResult.stale;
      delete row.uploadResult.staleLinks;
      delete row.publishError;
    } catch (error) {
      row.publishError = message(error);
      failures++;
      if (publisher === 'ninjabox') {
        for (const pending of eligible.slice(position + 1)) {
          pending.row.publishError = 'NinjaBox остановлен после ошибки предыдущей точки';
        }
        await onRows([...rows]);
        return { failures, stopped: true };
      }
    }
    await onRows([...rows]);
    onProgress(publisher, index + 1, active.length);
  }
  return { failures, stopped: false };
}
