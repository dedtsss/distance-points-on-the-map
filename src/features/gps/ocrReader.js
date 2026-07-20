import { readGpsFromImageOcr } from '../../utils/ocrGpsReader.js';
import { readFixedOverlayProfile } from './fixedOverlayOcr.js';

export async function readCoordinatesWithOcr(stableFile, options = {}) {
  const fixed = await readFixedOverlayProfile(stableFile, options);
  if (fixed.matched && fixed.result) return fixed.result;

  const generic = await readGpsFromImageOcr(stableFile, options);
  return {
    ...generic,
    attempts: [...(fixed.attempts || []), ...(generic.attempts || [])],
    indexAttempts: [...(fixed.indexAttempts || []), ...(generic.indexAttempts || [])],
  };
}
