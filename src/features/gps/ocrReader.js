import { readGpsFromImageOcr } from '../../utils/ocrGpsReader.js';

export function readCoordinatesWithOcr(stableFile, options = {}) {
  return readGpsFromImageOcr(stableFile, options);
}
