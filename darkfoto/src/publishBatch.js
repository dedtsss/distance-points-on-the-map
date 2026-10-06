import { cleanImageForUpload } from './core/features/cleanup/cleanImageForUpload.js';
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
  const eligible = rows.map((row, index) => ({ row, index,
    filename: outgoingName(row, hasRecognizedIndex(row) ? unresolvedNumber : ++unresolvedNumber) }))
    .filter(({ row }) => !row.uploadResult?.links?.some((link) => link.provider === publisher && link.url));
  for (const [position, { row, index, filename }] of eligible.entries()) {
    onStatus(`Очистка ${index + 1}/${rows.length}`);
    onProgress('cleanup', index, rows.length);
    let cleaned;
    try {
      cleaned = await withTimeout(async () => {
        const file = await fileAt(index);
        const result = await clean(file, {
          orientation: row.orientation,
          preferredFilename: filename,
        });
        if (!result.ok) throw new Error(result.error);
        return result.file;
      }, cleanupTimeoutMs, 'Очистка');
    } catch (error) {
      row.publishError = `Очистка: ${message(error)}`;
      failures++;
      await onRows([...rows]);
      continue;
    }
    onCleaned(row, cleaned);
    onStatus(`${publisher === 'ninjabox' ? 'NinjaBox' : 'Onion'} ${index + 1}/${rows.length}`);
    onProgress(publisher, index, rows.length);
    try {
      const url = publisher === 'onion'
        ? await publishOnion(cleaned, destination)
        : await publishNinjabox(cleaned, destination, {
          onProgress: (loaded, total) => onProgress('ninjabox', index, rows.length,
            total > 0 ? loaded / total : null),
        });
      row.uploadResult.links = [{ provider: publisher, url }];
      delete row.publishError;
    } catch (error) {
      row.publishError = message(error);
      failures++;
      if (publisher === 'ninjabox') {
        for (const pending of eligible.slice(position + 1)) {
          pending.row.publishError = 'NinjaBox остановлен после ошибки предыдущего фото';
        }
        await onRows([...rows]);
        return { failures, stopped: true };
      }
    }
    await onRows([...rows]);
    onProgress(publisher, index + 1, rows.length);
  }
  return { failures, stopped: false };
}
