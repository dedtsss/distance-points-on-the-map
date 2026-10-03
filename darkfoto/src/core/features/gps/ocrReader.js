import { readGpsFromImageOcr } from '../../utils/ocrGpsReader.js';
import { readFixedOverlayProfile } from './fixedOverlayOcr.js';

export async function readCoordinatesWithOcr(stableFile, options = {}) {
  const fixed = await readFixedOverlayProfile(stableFile, options);
  if (fixed.matched && fixed.result?.indexFromOcr) return fixed.result;

  const generic = await readGpsFromImageOcr(stableFile, options);
  if (fixed.matched && fixed.result) return {
    ...fixed.result,
    indexFromOcr: generic.indexFromOcr || null,
    indexStatus: generic.indexStatus || 'missing',
    indexAttempts: [...(fixed.result.indexAttempts || []), ...(generic.indexAttempts || [])],
    attempts: [...(fixed.result.attempts || []), ...(generic.attempts || [])],
    warnings: generic.indexFromOcr ? [] : ['index_not_found'],
  };
  return {
    ...generic,
    attempts: [...(fixed.attempts || []), ...(generic.attempts || [])],
    indexAttempts: [...(fixed.indexAttempts || []), ...(generic.indexAttempts || [])],
  };
}
