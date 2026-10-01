import { registerPlugin } from '@capacitor/core';
import { readAndroidPhoto, clearAndroidPhotoCache } from './androidFolder.js';
import { readPhoto } from './core/readPhoto.js';
import { splitBatch } from './core/batch.js';

export async function runAndroidAcceptance() {
  const folder = registerPlugin('DarkFotoFolder');
  const { files } = await folder.prepareTestPhotos();
  const photos = [];
  for (const [index, item] of files.entries()) {
    const file = await readAndroidPhoto(item);
    const result = await readPhoto(file);
    photos.push({ id: String(index + 1), number: index + 1, fileName: item.name, ...result });
  }
  const grouped = splitBatch(photos);
  await clearAndroidPhotoCache();
  return { photos: photos.map((photo) => ({ index: photo.indexFromOcr, indexStatus: photo.indexStatus,
    coordinates: photo.coordinates, ocrStatus: photo.ocrStatus, warnings: photo.warnings })),
  main: grouped.main.length, reserve: grouped.reserve.length, unresolved: grouped.unresolved.length,
  remainingConflicts: grouped.remainingConflicts.length };
}
