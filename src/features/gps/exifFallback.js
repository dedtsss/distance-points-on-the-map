import { readPhotoExif } from '../../utils/exifReader.js';

export function readCoordinatesFromExif(stableFile) {
  return readPhotoExif(stableFile);
}
