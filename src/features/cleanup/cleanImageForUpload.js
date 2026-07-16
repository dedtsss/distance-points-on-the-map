import { cleanImageWithCanvas, DEFAULT_CANVAS_MAX_SIDE } from './canvasFallbackCleaner.js';
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

const technicalMessage = (error) => (error instanceof Error ? error.message : String(error || 'cleanup failed'));

const makeFailure = (error, debug) => ({
  ok: false,
  file: null,
  cleanedBlob: null,
  method: 'failed',
  verification: debug?.verification || null,
  warnings: [],
  error: technicalMessage(error),
  debug,
});

const normalizeCanvasResult = (result) => (
  result instanceof File ? { file: result, debug: {} } : result
);

export async function cleanImageForUpload(stableFile, options = {}) {
  const orientation = [1, 3, 6, 8].includes(options.orientation) ? options.orientation : 1;
  const filename = normalizedFilename(options.preferredFilename);
  const strip = options.dependencies?.strip || stripJpegMetadataFromArrayBuffer;
  const verify = options.dependencies?.verify || verifyCleanedMetadata;
  const cleanCanvas = options.dependencies?.cleanCanvas || cleanImageWithCanvas;
  const jpeg = isJpegFile(stableFile);
  const debug = {
    originalName: options.originalName || stableFile?.name || '',
    safeName: options.safeName || stableFile?.name || '',
    type: options.type || stableFile?.type || '',
    size: Number(options.size ?? stableFile?.size) || 0,
    orientation,
    selectedCleanupPath: null,
    binarySkipReason: jpeg ? null : 'not_jpeg',
    binaryStrip: null,
    canvasFallback: null,
    verification: null,
  };

  if (!stableFile) return makeFailure(new Error('Стабильная копия файла недоступна'), debug);

  // JPEG cleanup is binary-first for every EXIF orientation. This avoids
  // decoding full-size Android camera files unless verification requires it.
  if (jpeg) {
    try {
      const stripped = strip(await stableFile.arrayBuffer());
      const cleanedFile = new File([stripped.arrayBuffer], filename, {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });
      const verification = await verify(cleanedFile);
      debug.binaryStrip = {
        ok: true,
        metadataRemoved: stripped.metadataRemoved,
        removedBytes: stripped.removedBytes,
        removedSegments: stripped.removedSegments,
        verification,
      };
      debug.verification = verification;

      if (isMetadataVerificationSafe(verification)) {
        debug.selectedCleanupPath = 'binary-jpeg-strip';
        return {
          ok: true,
          file: cleanedFile,
          cleanedBlob: cleanedFile,
          filename,
          method: 'binary-jpeg-strip',
          metadataRemoved: stripped.metadataRemoved,
          verification,
          warnings: [],
          debug,
        };
      }

      debug.binaryStrip.unsafeReason = verification.checked
        ? 'metadata_remaining'
        : 'verification_failed';
    } catch (error) {
      debug.binaryStrip = { ok: false, error: technicalMessage(error) };
    }
  }

  debug.selectedCleanupPath = 'canvas-fallback';
  try {
    const canvasResult = normalizeCanvasResult(await cleanCanvas(stableFile, orientation, filename, {
      maxSide: options.canvasMaxSide || DEFAULT_CANVAS_MAX_SIDE,
    }));
    if (!canvasResult?.file) throw new Error('Canvas не вернул очищенный файл');
    const verification = await verify(canvasResult.file);
    debug.canvasFallback = { ok: true, ...canvasResult.debug, verification };
    debug.verification = verification;

    if (!isMetadataVerificationSafe(verification)) {
      return makeFailure(new Error('Проверка metadata после очистки не пройдена'), debug);
    }

    return {
      ok: true,
      file: canvasResult.file,
      cleanedBlob: canvasResult.file,
      filename,
      method: 'canvas-fallback',
      metadataRemoved: true,
      verification,
      warnings: [],
      debug,
    };
  } catch (error) {
    debug.canvasFallback = { ok: false, error: technicalMessage(error) };
    return makeFailure(error, debug);
  }
}
