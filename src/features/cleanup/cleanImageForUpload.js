import { cleanImageWithCanvas } from './canvasFallbackCleaner.js';
import { isJpegFile, stripJpegMetadataFromArrayBuffer } from './jpegMetadataStripper.js';
import { isMetadataVerificationSafe, verifyCleanedMetadata } from './metadataVerifier.js';

const normalizedFilename = (preferredFilename) => {
  const safe = String(preferredFilename || 'photo')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${safe || 'photo'}.jpg`;
};

const makeFailure = (error, debug = {}) => ({
  ok: false,
  file: null,
  cleanedBlob: null,
  method: 'failed',
  verification: null,
  warnings: [],
  error: error instanceof Error ? error.message : String(error || 'cleanup failed'),
  debug,
});

const isAcceptablyClean = (verification) => isMetadataVerificationSafe(verification);

export async function cleanImageForUpload(stableFile, options = {}) {
  const orientation = [1, 3, 6, 8].includes(options.orientation) ? options.orientation : 1;
  const filename = normalizedFilename(options.preferredFilename);
  const strip = options.dependencies?.strip || stripJpegMetadataFromArrayBuffer;
  const verify = options.dependencies?.verify || verifyCleanedMetadata;
  const cleanCanvas = options.dependencies?.cleanCanvas || cleanImageWithCanvas;
  const attempts = [];

  if (!stableFile) return makeFailure(new Error('Стабильная копия файла недоступна'));

  if (isJpegFile(stableFile) && orientation === 1) {
    try {
      const stripped = strip(await stableFile.arrayBuffer());
      const cleanedFile = new File([stripped.arrayBuffer], filename, {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });
      const verification = await verify(cleanedFile);
      attempts.push({ method: 'binary-jpeg-strip', stripped, verification });
      if (isAcceptablyClean(verification)) {
        return {
          ok: true,
          file: cleanedFile,
          cleanedBlob: cleanedFile,
          filename,
          method: 'binary-jpeg-strip',
          metadataRemoved: true,
          verification,
          warnings: [],
          debug: { attempts },
        };
      }
    } catch (error) {
      attempts.push({ method: 'binary-jpeg-strip', error: error instanceof Error ? error.message : String(error) });
    }
  }

  try {
    const cleanedFile = await cleanCanvas(stableFile, orientation, filename);
    const verification = await verify(cleanedFile);
    attempts.push({ method: 'canvas-fallback', verification });
    if (!isAcceptablyClean(verification)) {
      return makeFailure(new Error('Проверка metadata после очистки не пройдена'), { attempts });
    }

    return {
      ok: true,
      file: cleanedFile,
      cleanedBlob: cleanedFile,
      filename,
      method: 'canvas-fallback',
      metadataRemoved: true,
      verification,
      warnings: [],
      debug: { attempts },
    };
  } catch (error) {
    attempts.push({ method: 'canvas-fallback', error: error instanceof Error ? error.message : String(error) });
    return makeFailure(error, { attempts });
  }
}
