import { readGpsFromImageOcr } from '../../utils/ocrGpsReader.js';

export function readCoordinatesWithOcr(stableFile, options = {}) {
  return readGpsFromImageOcr(stableFile, {
    ...options,
    // One recognition pass per photo keeps Android memory/CPU usage bounded.
    maxAttempts: 1,
  });
}
