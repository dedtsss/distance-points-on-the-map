import { registerPlugin } from '@capacitor/core';
import { readAndroidPhoto, clearAndroidPhotoCache } from './androidFolder.js';
import { readPhoto } from './core/readPhoto.js';
import { splitBatch } from './core/batch.js';
import { recognizeAndroidStamp } from './nativeOcr.js';

export async function runAndroidAcceptance() {
  const folder = registerPlugin('DarkFotoFolder');
  const { files } = await folder.prepareTestPhotos();
  const photos = [];
  for (const [index, item] of files.entries()) {
    const ocr = await recognizeAndroidStamp(item, { debug: true });
    const file = await readAndroidPhoto(item);
    const result = await readPhoto(file, { readOcr: async () => ocr });
    photos.push({ id: String(index + 1), number: index + 1, fileName: item.name,
      ...result, debugPasses: ocr.debugPasses });
  }
  const grouped = splitBatch(photos);
  const single = splitBatch([photos[3]]);
  await clearAndroidPhotoCache();
  return { photos: photos.map((photo) => ({ index: photo.indexFromOcr, indexStatus: photo.indexStatus,
    coordinates: photo.coordinates, ocrStatus: photo.ocrStatus, warnings: photo.warnings,
    engine: photo.ocrEngine, recognitionMs: photo.recognitionMs, debugPasses: photo.debugPasses })),
  main: grouped.main.length, reserve: grouped.reserve.length, unresolved: grouped.unresolved.length,
  singleMain: single.main.length, singleReserve: single.reserve.length, singleUnresolved: single.unresolved.length,
  remainingConflicts: grouped.remainingConflicts.length };
}
