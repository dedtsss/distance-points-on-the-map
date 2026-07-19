import {
  FILE_SKIP_REASON_LABELS,
  FILE_SKIP_REASONS,
  MAX_PHOTOS,
  createFileCandidate,
  displayCandidatePath,
  fileIdentityKey,
  getCandidateFile,
  getCandidateRelativePath,
  getFileValidationIssue,
  normalizeRelativePath,
  validationErrorMessage,
} from './fileValidation.js';

export const FOLDER_IMPORT_STATUSES = Object.freeze({
  IDLE: 'idle',
  SELECTING: 'selecting',
  SCANNING: 'scanning',
  ADDING: 'adding',
  DONE: 'done',
  ERROR: 'error',
  CANCELLED: 'cancelled',
});

export const FOLDER_HELP_TEXT = 'Можно выбрать физическую папку с фотографиями через системный проводник. Виртуальные альбомы галереи, облачные подборки и “Избранное” могут быть недоступны как папки.';

const DEFAULT_FOLDER_NAME = 'Выбранная папка';
const REPORT_EXAMPLE_LIMIT = 6;

const collator = new Intl.Collator('ru-RU', {
  numeric: false,
  sensitivity: 'base',
});

const abortError = () => {
  if (typeof DOMException !== 'undefined') return new DOMException('Folder import was cancelled.', 'AbortError');
  const error = new Error('Folder import was cancelled.');
  error.name = 'AbortError';
  return error;
};

export function assertFolderImportNotAborted(signal) {
  if (signal?.aborted) throw abortError();
}

export function getFolderPickerCapabilities(globalScope = globalThis, documentRef = globalScope?.document) {
  const input = documentRef?.createElement ? documentRef.createElement('input') : null;
  if (input) input.type = 'file';
  return {
    showDirectoryPicker: typeof globalScope?.showDirectoryPicker === 'function'
      || typeof globalScope?.__gpsFolderPickerAdapter?.showDirectoryPicker === 'function',
    webkitDirectory: Boolean(input && ('webkitdirectory' in input || 'webkitDirectory' in input)),
  };
}

export async function requestDirectoryHandle(options = {}) {
  const adapter = options.adapter || globalThis.__gpsFolderPickerAdapter;
  if (typeof adapter?.showDirectoryPicker === 'function') {
    return adapter.showDirectoryPicker({ mode: 'read' });
  }
  if (typeof globalThis.showDirectoryPicker === 'function') {
    return globalThis.showDirectoryPicker({ mode: 'read' });
  }
  throw new Error('Выбор папки через File System Access API недоступен в этом браузере.');
}

function tokenizeNaturalPath(value) {
  return String(value || '')
    .normalize('NFKC')
    .split(/(\d+)/u)
    .filter((part) => part !== '')
    .map((part) => {
      if (!/^\d+$/u.test(part)) return { type: 'text', value: part.toLocaleLowerCase('ru-RU') };
      const withoutZeros = part.replace(/^0+/u, '') || '0';
      return {
        type: 'number',
        value: withoutZeros,
        rawLength: part.length,
        raw: part,
      };
    });
}

function compareNumberTokens(left, right) {
  if (left.value.length !== right.value.length) return left.value.length - right.value.length;
  if (left.value !== right.value) return left.value < right.value ? -1 : 1;
  if (left.rawLength !== right.rawLength) return left.rawLength - right.rawLength;
  return collator.compare(left.raw, right.raw);
}

export function naturalComparePath(left, right) {
  const leftTokens = tokenizeNaturalPath(left);
  const rightTokens = tokenizeNaturalPath(right);
  const length = Math.max(leftTokens.length, rightTokens.length);

  for (let index = 0; index < length; index += 1) {
    const leftToken = leftTokens[index];
    const rightToken = rightTokens[index];
    if (!leftToken) return -1;
    if (!rightToken) return 1;
    if (leftToken.type === 'number' && rightToken.type === 'number') {
      const result = compareNumberTokens(leftToken, rightToken);
      if (result !== 0) return result;
      continue;
    }
    if (leftToken.type !== rightToken.type) return leftToken.type === 'number' ? -1 : 1;
    const result = collator.compare(leftToken.value, rightToken.value);
    if (result !== 0) return result;
  }

  return 0;
}

export function sortFileCandidates(candidates) {
  return [...(candidates || [])].sort((left, right) => (
    naturalComparePath(
      getCandidateRelativePath(left) || getCandidateFile(left)?.name || '',
      getCandidateRelativePath(right) || getCandidateFile(right)?.name || '',
    )
  ));
}

export function folderNameFromPath(relativePath, fallback = DEFAULT_FOLDER_NAME) {
  const normalized = normalizeRelativePath(relativePath);
  return normalized.split('/')[0] || fallback;
}

function createSkipBuckets() {
  return Object.fromEntries(Object.values(FILE_SKIP_REASONS).map((reason) => [reason, 0]));
}

export function createFolderImportReport(input = {}) {
  return {
    status: input.status || FOLDER_IMPORT_STATUSES.IDLE,
    folderName: input.folderName || DEFAULT_FOLDER_NAME,
    foundFiles: Number(input.foundFiles) || 0,
    addedPhotos: Number(input.addedPhotos) || 0,
    skippedFiles: Number(input.skippedFiles) || 0,
    nestedFolders: Number(input.nestedFolders) || 0,
    skippedByReason: { ...createSkipBuckets(), ...(input.skippedByReason || {}) },
    skipExamples: Array.isArray(input.skipExamples) ? [...input.skipExamples] : [],
    source: input.source || 'folder',
    message: input.message || '',
  };
}

export function addSkipToReport(report, reason, candidate, message = '') {
  const next = createFolderImportReport(report);
  const normalizedReason = FILE_SKIP_REASON_LABELS[reason] ? reason : FILE_SKIP_REASONS.UNSUPPORTED;
  next.skippedByReason[normalizedReason] = (next.skippedByReason[normalizedReason] || 0) + 1;
  next.skippedFiles += 1;

  if (next.skipExamples.length < REPORT_EXAMPLE_LIMIT) {
    next.skipExamples.push({
      reason: normalizedReason,
      path: typeof candidate === 'string' ? normalizeRelativePath(candidate) : displayCandidatePath(candidate),
      message: message || validationErrorMessage(candidate, normalizedReason),
    });
  }

  return next;
}

export function prepareFolderImport(entries, options = {}) {
  let report = createFolderImportReport({
    ...options.report,
    folderName: options.folderName || options.report?.folderName || DEFAULT_FOLDER_NAME,
    foundFiles: Number(options.foundFiles ?? options.report?.foundFiles ?? entries?.length) || 0,
    nestedFolders: Number(options.nestedFolders ?? options.report?.nestedFolders) || 0,
    source: options.source || options.report?.source || 'folder',
  });
  const maxPhotos = Number(options.maxPhotos) || MAX_PHOTOS;
  const accepted = [];
  const seen = new Set();

  for (const candidate of sortFileCandidates(entries)) {
    const issue = getFileValidationIssue(candidate);
    if (issue) {
      report = addSkipToReport(report, issue, candidate);
      continue;
    }

    const key = fileIdentityKey(candidate);
    if (seen.has(key)) {
      report = addSkipToReport(report, FILE_SKIP_REASONS.DUPLICATE, candidate);
      continue;
    }
    seen.add(key);

    if (accepted.length >= maxPhotos) {
      report = addSkipToReport(report, FILE_SKIP_REASONS.LIMIT, candidate);
      continue;
    }

    accepted.push(candidate);
  }

  report.addedPhotos = accepted.length;
  report.skippedFiles = Math.max(report.skippedFiles, Math.max(0, report.foundFiles - report.addedPhotos));
  return { files: accepted, report };
}

function inferFolderNameFromFileList(files, fallback = DEFAULT_FOLDER_NAME) {
  const firstPath = files.map((file) => normalizeRelativePath(file?.webkitRelativePath || file?.relativePath || ''))
    .find(Boolean);
  return folderNameFromPath(firstPath, fallback);
}

function countNestedFoldersFromFileList(files) {
  const directories = new Set();
  for (const file of files) {
    const relativePath = normalizeRelativePath(file?.webkitRelativePath || file?.relativePath || '');
    const parts = relativePath.split('/').filter(Boolean);
    if (parts.length <= 2) continue;
    for (let index = 1; index < parts.length - 1; index += 1) {
      directories.add(parts.slice(1, index + 1).join('/'));
    }
  }
  return directories.size;
}

export function prepareFolderImportFromFileList(fileList, options = {}) {
  const files = Array.from(fileList || []);
  const folderName = options.folderName || inferFolderNameFromFileList(files);
  const entries = files.map((file) => createFileCandidate(file, normalizeRelativePath(file.webkitRelativePath || file.relativePath || file.name)));
  return prepareFolderImport(entries, {
    ...options,
    folderName,
    foundFiles: files.length,
    nestedFolders: options.nestedFolders ?? countNestedFoldersFromFileList(files),
    source: options.source || 'input',
  });
}

export async function collectFilesFromDirectoryHandle(directoryHandle, options = {}) {
  const folderName = options.folderName || directoryHandle?.name || DEFAULT_FOLDER_NAME;
  const entries = [];
  let report = createFolderImportReport({ folderName, source: 'showDirectoryPicker' });

  async function walk(handle, relativePrefix = '') {
    assertFolderImportNotAborted(options.signal);
    if (!handle?.entries) return;

    for await (const [entryName, childHandle] of handle.entries()) {
      assertFolderImportNotAborted(options.signal);
      if (childHandle.kind === 'directory') {
        report.nestedFolders += 1;
        await walk(childHandle, `${relativePrefix}${entryName}/`);
        continue;
      }

      if (childHandle.kind !== 'file') continue;
      const relativePath = normalizeRelativePath(`${folderName}/${relativePrefix}${entryName}`);
      report.foundFiles += 1;

      try {
        const file = await childHandle.getFile();
        entries.push(createFileCandidate(file, relativePath));
      } catch {
        report = addSkipToReport(report, FILE_SKIP_REASONS.READ_ERROR, relativePath, `${relativePath}: ошибка чтения.`);
      }
    }
  }

  await walk(directoryHandle);
  return { entries, report };
}

export async function prepareFolderImportFromDirectoryHandle(directoryHandle, options = {}) {
  const collection = await collectFilesFromDirectoryHandle(directoryHandle, options);
  return prepareFolderImport(collection.entries, {
    ...options,
    report: collection.report,
    source: 'showDirectoryPicker',
  });
}

function readFileSystemEntryFile(entry) {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

function readDirectoryEntries(reader) {
  return new Promise((resolve, reject) => {
    reader.readEntries(resolve, reject);
  });
}

async function readAllDirectoryEntries(directoryEntry) {
  const reader = directoryEntry.createReader();
  const entries = [];
  for (;;) {
    const batch = await readDirectoryEntries(reader);
    if (!batch.length) break;
    entries.push(...batch);
  }
  return entries;
}

async function collectFromFileSystemEntry(entry, report, entries, options = {}) {
  assertFolderImportNotAborted(options.signal);
  const entryPath = normalizeRelativePath(String(entry.fullPath || entry.name || '').replace(/^\//u, ''));

  if (entry.isDirectory) {
    if (entryPath.includes('/')) report.nestedFolders += 1;
    const children = await readAllDirectoryEntries(entry);
    for (const child of children) {
      await collectFromFileSystemEntry(child, report, entries, options);
    }
    return report;
  }

  if (!entry.isFile) return report;
  report.foundFiles += 1;
  try {
    const file = await readFileSystemEntryFile(entry);
    entries.push(createFileCandidate(file, entryPath || file.name));
  } catch {
    return addSkipToReport(report, FILE_SKIP_REASONS.READ_ERROR, entryPath || entry.name, `${entryPath || entry.name}: ошибка чтения.`);
  }
  return report;
}

async function collectFromFileSystemHandle(handle, report, entries, options = {}) {
  assertFolderImportNotAborted(options.signal);
  if (handle.kind === 'directory') {
    const collection = await collectFilesFromDirectoryHandle(handle, options);
    entries.push(...collection.entries);
    report.foundFiles += collection.report.foundFiles;
    report.nestedFolders += collection.report.nestedFolders;
    for (const example of collection.report.skipExamples) {
      report = addSkipToReport(report, example.reason, example.path, example.message);
    }
    return report;
  }

  if (handle.kind !== 'file') return report;
  report.foundFiles += 1;
  try {
    const file = await handle.getFile();
    entries.push(createFileCandidate(file, file.name));
  } catch {
    return addSkipToReport(report, FILE_SKIP_REASONS.READ_ERROR, handle.name || 'Файл', `${handle.name || 'Файл'}: ошибка чтения.`);
  }
  return report;
}

export async function prepareFolderImportFromDataTransfer(dataTransfer, options = {}) {
  const items = Array.from(dataTransfer?.items || []);
  const entries = [];
  let report = createFolderImportReport({ folderName: options.folderName || 'Перетаскивание', source: 'drop' });
  let sawDirectory = false;

  for (const item of items) {
    assertFolderImportNotAborted(options.signal);
    if (item.kind && item.kind !== 'file') continue;

    if (typeof item.getAsFileSystemHandle === 'function') {
      const handle = await item.getAsFileSystemHandle();
      if (!handle) continue;
      sawDirectory ||= handle.kind === 'directory';
      report = await collectFromFileSystemHandle(handle, report, entries, options);
      continue;
    }

    if (typeof item.webkitGetAsEntry === 'function') {
      const entry = item.webkitGetAsEntry();
      if (!entry) continue;
      sawDirectory ||= entry.isDirectory === true;
      report = await collectFromFileSystemEntry(entry, report, entries, options);
      continue;
    }

    const file = item.getAsFile?.();
    if (file) {
      report.foundFiles += 1;
      entries.push(createFileCandidate(file, file.webkitRelativePath || file.name));
    }
  }

  if (!entries.length && dataTransfer?.files?.length) {
    return {
      ...prepareFolderImportFromFileList(dataTransfer.files, { ...options, source: 'drop' }),
      hasDirectory: false,
    };
  }

  const firstPath = entries.map(getCandidateRelativePath).find(Boolean);
  report.folderName = sawDirectory ? folderNameFromPath(firstPath, 'Перетаскивание папки') : 'Перетаскивание файлов';
  return {
    ...prepareFolderImport(entries, { ...options, report, source: 'drop' }),
    hasDirectory: sawDirectory,
  };
}

export function applyBufferResultToFolderReport(report, bufferedResult) {
  let next = createFolderImportReport(report);
  for (const copyError of bufferedResult?.copyErrors || []) {
    next = addSkipToReport(next, FILE_SKIP_REASONS.READ_ERROR, copyError.relativePath || copyError.fileName, copyError.message);
  }
  next.addedPhotos = Number(bufferedResult?.bufferedFiles?.length) || 0;
  next.skippedFiles = Math.max(0, next.foundFiles - next.addedPhotos);
  next.status = FOLDER_IMPORT_STATUSES.DONE;
  return next;
}

export function folderReportReasonRows(report) {
  const skippedByReason = report?.skippedByReason || {};
  return Object.values(FILE_SKIP_REASONS)
    .map((reason) => ({
      reason,
      label: FILE_SKIP_REASON_LABELS[reason],
      count: Number(skippedByReason[reason]) || 0,
    }))
    .filter((row) => row.count > 0);
}
