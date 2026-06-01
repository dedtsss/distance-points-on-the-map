import { readGpsFromImageOcr } from './ocrGpsReader';

export { parseGpsFromOcrText } from './ocrGpsReader';

export async function readCoordinatesFromImageText(file, options = {}) {
  const result = await readGpsFromImageOcr(file, options);

  return {
    ok: result.ok,
    index: result.indexFromOcr,
    coordinates: result.ok
      ? {
        latitude: result.latitude,
        longitude: result.longitude,
      }
      : null,
    rawText: result.rawText,
    statusText: result.ok ? 'OCR: координаты найдены' : 'OCR: координаты не распознаны',
    warnings: result.warnings,
  };
}
