import { cleanImageForUpload } from './core/features/cleanup/cleanImageForUpload.js';
import { publishCleanImage, publishCleanImageToNinjabox, withTimeout } from './core/publisher.js';

const message = (error) => error instanceof Error ? error.message : String(error);

export async function publishBatch(rows, unresolvedIds, options) {
  const { publisher, destination, fileAt, onStatus = () => {}, onRows = () => {},
    clean = cleanImageForUpload, publishOnion = publishCleanImage,
    publishNinjabox = publishCleanImageToNinjabox, cleanupTimeoutMs = 35_000 } = options;
  let failures = 0;
  const eligible = rows.map((row, index) => ({ row, index }))
    .filter(({ row }) => !unresolvedIds.has(row.id));
  for (const [position, { row, index }] of eligible.entries()) {
    onStatus(`Очистка ${index + 1}/${rows.length}`);
    let cleaned;
    try {
      cleaned = await withTimeout(async () => {
        const file = await fileAt(index);
        const result = await clean(file, {
          orientation: row.orientation,
          preferredFilename: `photo-${crypto.randomUUID()}`,
        });
        if (!result.ok) throw new Error(result.error);
        return result.file;
      }, cleanupTimeoutMs, 'Очистка');
    } catch (error) {
      row.publishError = `Очистка: ${message(error)}`;
      failures++;
      onRows([...rows]);
      continue;
    }
    onStatus(`${publisher === 'ninjabox' ? 'NinjaBox' : 'Onion'} ${index + 1}/${rows.length}`);
    try {
      const url = publisher === 'onion'
        ? await publishOnion(cleaned, destination)
        : await publishNinjabox(cleaned, destination);
      row.uploadResult.links = [{ provider: publisher, url }];
    } catch (error) {
      row.publishError = message(error);
      failures++;
      if (publisher === 'ninjabox') {
        for (const pending of eligible.slice(position + 1)) {
          pending.row.publishError = 'NinjaBox остановлен после ошибки предыдущего фото';
        }
        onRows([...rows]);
        return { failures, stopped: true };
      }
    }
    onRows([...rows]);
  }
  return { failures, stopped: false };
}
