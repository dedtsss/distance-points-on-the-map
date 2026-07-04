import { validateSelectedFiles } from './fileValidation.js';

const extensionForType = (type) => ({
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
}[type] || '.jpg');

const typeForFile = (file) => {
  const provided = String(file.type || '').toLowerCase();
  if (provided.startsWith('image/')) return provided;
  const name = String(file.name || '');
  if (/\.png$/i.test(name)) return 'image/png';
  if (/\.webp$/i.test(name)) return 'image/webp';
  if (/\.jpe?g$/i.test(name)) return 'image/jpeg';
  return 'application/octet-stream';
};

export function makeSafeFileName(name, type, index = 0) {
  const original = String(name || '').trim();
  const extensionMatch = original.match(/\.[a-z0-9]{2,5}$/i);
  const extension = extensionMatch?.[0].toLowerCase() || extensionForType(type);
  const stem = original
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return `${stem || `photo-${index + 1}`}${extension}`;
}

export async function createStableFileCopy(file, index = 0) {
  const type = typeForFile(file);
  const safeName = makeSafeFileName(file.name, type, index);

  // This is the only read from the Android picker File. Every later stage uses
  // the new in-memory File/Blob and no longer depends on the picker handle.
  const sourceBuffer = await file.arrayBuffer();
  const stableBlob = new Blob([sourceBuffer], { type });
  const stableFile = new File([stableBlob], safeName, {
    type,
    lastModified: Date.now(),
  });

  return {
    originalName: file.name || safeName,
    safeName,
    type,
    size: stableFile.size,
    sourceBuffer,
    stableBlob,
    stableFile,
    previewObjectUrl: null,
  };
}

export async function bufferSelectedFiles(fileList) {
  const { validFiles, errors } = validateSelectedFiles(fileList);
  const settled = await Promise.allSettled(
    validFiles.map((file, index) => createStableFileCopy(file, index)),
  );
  const bufferedFiles = [];

  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      bufferedFiles.push(result.value);
      return;
    }

    errors.push(`${validFiles[index].name}: не удалось скопировать файл во внутренний буфер.`);
  });

  return { bufferedFiles, errors };
}
