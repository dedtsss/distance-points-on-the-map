import {
  displayCandidatePath,
  getCandidateFile,
  getCandidateRelativePath,
  validateSelectedFiles,
} from './fileValidation.js';
import { createLightweightThumbnail } from './thumbnail.js';

export const DEFAULT_FILE_COPY_CONCURRENCY = 2;

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

const assertNotAborted = (signal) => {
  if (signal?.aborted) {
    if (typeof DOMException !== 'undefined') {
      throw new DOMException('File buffering was cancelled.', 'AbortError');
    }
    const error = new Error('File buffering was cancelled.');
    error.name = 'AbortError';
    throw error;
  }
};

async function mapWithConcurrency(items, limit, callback, signal) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(Number(limit) || DEFAULT_FILE_COPY_CONCURRENCY, items.length || 1));

  async function worker() {
    while (nextIndex < items.length) {
      assertNotAborted(signal);
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = { status: 'fulfilled', value: await callback(items[index], index) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

export async function createStableFileCopy(candidate, index = 0, options = {}) {
  assertNotAborted(options.signal);
  const file = getCandidateFile(candidate);
  const type = typeForFile(file);
  const safeName = makeSafeFileName(file.name, type, index);
  const relativePath = getCandidateRelativePath(candidate);

  // This is the only read from the Android picker File. Every later stage uses
  // the new in-memory File/Blob and no longer depends on the picker handle.
  const sourceBuffer = await file.arrayBuffer();
  assertNotAborted(options.signal);
  const stableBlob = new Blob([sourceBuffer], { type });
  const stableFile = new File([stableBlob], safeName, {
    type,
    lastModified: Date.now(),
  });

  return {
    originalName: file.name || safeName,
    relativePath,
    originalLastModified: Number(file.lastModified) || 0,
    safeName,
    type,
    size: stableFile.size,
    sourceBuffer,
    stableBlob,
    stableFile,
    previewObjectUrl: null,
    thumbnailDataUrl: null,
    thumbnailError: null,
  };
}

export async function bufferSelectedFiles(fileList, options = {}) {
  const { validFiles, errors } = validateSelectedFiles(fileList);
  const thumbnailFactory = options.thumbnailFactory || createLightweightThumbnail;
  const copyErrors = [];
  const settled = await mapWithConcurrency(
    validFiles,
    options.copyConcurrency || DEFAULT_FILE_COPY_CONCURRENCY,
    (file, index) => createStableFileCopy(file, index, { signal: options.signal }),
    options.signal,
  );
  const bufferedFiles = [];

  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      bufferedFiles.push(result.value);
      return;
    }

    const error = {
      fileName: getCandidateFile(validFiles[index])?.name || 'Файл',
      relativePath: getCandidateRelativePath(validFiles[index]),
      message: `${displayCandidatePath(validFiles[index])}: не удалось скопировать файл во внутренний буфер.`,
    };
    copyErrors.push(error);
    errors.push(error.message);
  });

  // Decode thumbnails sequentially. Concurrent full camera-image decodes can
  // exhaust Android Chrome memory even though the resulting canvases are tiny.
  for (let index = 0; index < bufferedFiles.length; index += 1) {
    assertNotAborted(options.signal);
    try {
      bufferedFiles[index].thumbnailDataUrl = await thumbnailFactory(bufferedFiles[index].stableFile);
    } catch (error) {
      bufferedFiles[index].thumbnailError = error instanceof Error ? error.message : String(error);
    }
  }

  return { bufferedFiles, errors, copyErrors };
}
