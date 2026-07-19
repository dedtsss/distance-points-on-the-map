export const ACCEPTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

export const ACCEPTED_IMAGE_EXTENSIONS = /\.(jpe?g|png|webp)$/i;
export const MAX_PHOTOS = 20;

export const FILE_SKIP_REASONS = Object.freeze({
  EMPTY: 'empty',
  UNSUPPORTED: 'unsupported',
  DUPLICATE: 'duplicate',
  READ_ERROR: 'read_error',
  LIMIT: 'limit',
  SYSTEM: 'system',
});

export const FILE_SKIP_REASON_LABELS = Object.freeze({
  [FILE_SKIP_REASONS.EMPTY]: 'пустой файл',
  [FILE_SKIP_REASONS.UNSUPPORTED]: 'неподдерживаемый формат',
  [FILE_SKIP_REASONS.DUPLICATE]: 'дубликат',
  [FILE_SKIP_REASONS.READ_ERROR]: 'ошибка чтения',
  [FILE_SKIP_REASONS.LIMIT]: 'превышение существующего ограничения',
  [FILE_SKIP_REASONS.SYSTEM]: 'системный файл',
});

const SYSTEM_FILE_NAMES = new Set([
  '.ds_store',
  'thumbs.db',
  'desktop.ini',
]);

const normalizePathSeparators = (value) => String(value || '').replace(/\\/g, '/');

export function normalizeRelativePath(value) {
  return normalizePathSeparators(value)
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/');
}

export function getCandidateFile(candidate) {
  return typeof File !== 'undefined' && candidate?.file instanceof File ? candidate.file : candidate;
}

export function getCandidateRelativePath(candidate) {
  const file = getCandidateFile(candidate);
  return normalizeRelativePath(
    candidate?.relativePath
    || file?.relativePath
    || file?.webkitRelativePath
    || '',
  );
}

export function createFileCandidate(file, relativePath = '') {
  return {
    file,
    relativePath: normalizeRelativePath(relativePath),
  };
}

export function displayCandidatePath(candidate) {
  const file = getCandidateFile(candidate);
  return getCandidateRelativePath(candidate) || file?.name || 'Файл';
}

export function hasSupportedImageType(file) {
  const type = String(file?.type || '').toLowerCase();
  const name = String(file?.name || '');
  const supportedExtension = ACCEPTED_IMAGE_EXTENSIONS.test(name);

  if (ACCEPTED_IMAGE_TYPES.has(type)) return true;
  if (!type) return supportedExtension;
  return false;
}

export function isSystemJunkFile(candidate) {
  const file = getCandidateFile(candidate);
  const relativePath = getCandidateRelativePath(candidate);
  const name = String(file?.name || relativePath.split('/').at(-1) || '').toLowerCase();
  if (SYSTEM_FILE_NAMES.has(name)) return true;
  return normalizePathSeparators(relativePath).split('/').some((part) => part.toLowerCase() === '__macosx');
}

export function getFileValidationIssue(candidate) {
  const file = getCandidateFile(candidate);
  if (!file) return FILE_SKIP_REASONS.READ_ERROR;
  if (isSystemJunkFile(candidate)) return FILE_SKIP_REASONS.SYSTEM;
  if (Number(file.size) <= 0) return FILE_SKIP_REASONS.EMPTY;
  if (!hasSupportedImageType(file)) return FILE_SKIP_REASONS.UNSUPPORTED;
  return null;
}

export function fileIdentityKey(candidate) {
  const file = getCandidateFile(candidate);
  const relativePath = getCandidateRelativePath(candidate);
  const path = relativePath || file?.name || '';
  return [
    path.toLocaleLowerCase('ru-RU'),
    Number(file?.size) || 0,
    Number(file?.lastModified) || 0,
  ].join('|');
}

export function validationErrorMessage(candidate, reason) {
  const path = displayCandidatePath(candidate);
  if (reason === FILE_SKIP_REASONS.EMPTY) return `${path}: файл пустой.`;
  if (reason === FILE_SKIP_REASONS.UNSUPPORTED) return `${path}: поддерживаются JPG, PNG и WebP.`;
  if (reason === FILE_SKIP_REASONS.SYSTEM) return `${path}: системный файл пропущен.`;
  if (reason === FILE_SKIP_REASONS.READ_ERROR) return `${path}: не удалось прочитать файл.`;
  if (reason === FILE_SKIP_REASONS.DUPLICATE) return `${path}: дубликат пропущен.`;
  if (reason === FILE_SKIP_REASONS.LIMIT) return `${path}: превышено ограничение ${MAX_PHOTOS} фотографий.`;
  return `${path}: файл пропущен.`;
}

export function validateSelectedFiles(files) {
  const selected = Array.from(files || []);
  const errors = [];

  if (selected.length > MAX_PHOTOS) {
    errors.push(`Можно выбрать не более ${MAX_PHOTOS} фотографий за один раз.`);
  }

  const validFiles = selected.slice(0, MAX_PHOTOS).filter((candidate) => {
    const issue = getFileValidationIssue(candidate);
    if (issue) {
      errors.push(validationErrorMessage(candidate, issue));
      return false;
    }

    return true;
  });

  return { validFiles, errors };
}
