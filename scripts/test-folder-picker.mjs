import assert from 'node:assert/strict';
import {
  FILE_SKIP_REASONS,
  MAX_PHOTOS,
  createFileCandidate,
  validateSelectedFiles,
} from '../src/features/files/fileValidation.js';
import {
  getFolderPickerCapabilities,
  naturalComparePath,
  prepareFolderImport,
  prepareFolderImportFromDirectoryHandle,
  prepareFolderImportFromFileList,
  sortFileCandidates,
} from '../src/features/files/folderPicker.js';
import { bufferSelectedFiles } from '../src/features/files/stableFileStore.js';

const bytes = (size = 3) => new Uint8Array(Array.from({ length: size }, (_, index) => index + 1));

const makeFile = (name, type = 'image/jpeg', options = {}) => new File(
  [bytes(options.size || 3)],
  name,
  { type, lastModified: options.lastModified ?? 1_700_000_000_000 },
);

const withPath = (file, relativePath) => {
  Object.defineProperty(file, 'webkitRelativePath', { value: relativePath, configurable: true });
  return file;
};

const reasonCount = (report, reason) => Number(report.skippedByReason[reason]) || 0;

// 1. Supported image filtering follows the current pipeline types.
{
  const result = prepareFolderImport([
    createFileCandidate(makeFile('a.jpg', 'image/jpeg'), 'GPS/a.jpg'),
    createFileCandidate(makeFile('b.png', 'image/png'), 'GPS/b.png'),
    createFileCandidate(makeFile('c.webp', 'image/webp'), 'GPS/c.webp'),
    createFileCandidate(makeFile('d.heic', 'image/heic'), 'GPS/d.heic'),
  ], { folderName: 'GPS', foundFiles: 4 });
  assert.deepEqual(result.files.map((item) => item.file.name), ['a.jpg', 'b.png', 'c.webp']);
  assert.equal(reasonCount(result.report, FILE_SKIP_REASONS.UNSUPPORTED), 1);
}

// 2. Do not accept arbitrary files only by extension when MIME is explicit.
{
  const result = prepareFolderImport([
    createFileCandidate(makeFile('renamed.jpg', 'application/pdf'), 'GPS/renamed.jpg'),
  ], { folderName: 'GPS', foundFiles: 1 });
  assert.equal(result.files.length, 0);
  assert.equal(reasonCount(result.report, FILE_SKIP_REASONS.UNSUPPORTED), 1);
}

// 3 and 9. Natural sorting handles numbers and leading zero tie-breaks.
{
  const names = ['photo10.jpg', 'photo02.jpg', 'photo2.jpg', 'photo1.jpg'];
  const sorted = [...names].sort(naturalComparePath);
  assert.deepEqual(sorted, ['photo1.jpg', 'photo2.jpg', 'photo02.jpg', 'photo10.jpg']);
}

// 4. Fallback FileList import preserves nested relative paths.
{
  const files = [
    withPath(makeFile('photo10.jpg'), 'GPS object 15/day2/photo10.jpg'),
    withPath(makeFile('photo2.jpg'), 'GPS object 15/day2/photo2.jpg'),
  ];
  const result = prepareFolderImportFromFileList(files);
  assert.equal(result.report.folderName, 'GPS object 15');
  assert.equal(result.report.nestedFolders, 1);
  assert.deepEqual(result.files.map((item) => item.relativePath), [
    'GPS object 15/day2/photo2.jpg',
    'GPS object 15/day2/photo10.jpg',
  ]);
}

// 5. Duplicates inside one operation are skipped by relative path/name, size and lastModified.
{
  const first = createFileCandidate(makeFile('same.jpg', 'image/jpeg', { size: 5, lastModified: 42 }), 'GPS/same.jpg');
  const second = createFileCandidate(makeFile('same.jpg', 'image/jpeg', { size: 5, lastModified: 42 }), 'GPS/same.jpg');
  const result = prepareFolderImport([first, second], { folderName: 'GPS', foundFiles: 2 });
  assert.equal(result.files.length, 1);
  assert.equal(reasonCount(result.report, FILE_SKIP_REASONS.DUPLICATE), 1);
}

// 6. Empty folder gives a readable zero summary.
{
  const result = prepareFolderImport([], { folderName: 'Empty folder', foundFiles: 0, nestedFolders: 0 });
  assert.equal(result.report.folderName, 'Empty folder');
  assert.equal(result.report.foundFiles, 0);
  assert.equal(result.report.addedPhotos, 0);
  assert.equal(result.report.skippedFiles, 0);
}

// 7. Folder with only unsupported files does not produce photo candidates.
{
  const result = prepareFolderImport([
    createFileCandidate(makeFile('notes.txt', 'text/plain'), 'GPS/notes.txt'),
    createFileCandidate(makeFile('scan.gif', 'image/gif'), 'GPS/scan.gif'),
  ], { folderName: 'GPS', foundFiles: 2 });
  assert.equal(result.files.length, 0);
  assert.equal(result.report.skippedFiles, 2);
  assert.equal(reasonCount(result.report, FILE_SKIP_REASONS.UNSUPPORTED), 2);
}

// 8. Equal file names in different folders are not duplicates.
{
  const result = prepareFolderImport([
    createFileCandidate(makeFile('photo.jpg', 'image/jpeg', { size: 5, lastModified: 42 }), 'GPS/a/photo.jpg'),
    createFileCandidate(makeFile('photo.jpg', 'image/jpeg', { size: 5, lastModified: 42 }), 'GPS/b/photo.jpg'),
  ], { folderName: 'GPS', foundFiles: 2 });
  assert.equal(result.files.length, 2);
  assert.equal(reasonCount(result.report, FILE_SKIP_REASONS.DUPLICATE), 0);
}

// 10. Summary includes limit, empty, unsupported and duplicate reasons.
{
  const entries = Array.from({ length: MAX_PHOTOS + 2 }, (_, index) => (
    createFileCandidate(makeFile(`photo${index + 1}.jpg`), `GPS/photo${index + 1}.jpg`)
  ));
  entries.push(createFileCandidate(new File([], 'empty.jpg', { type: 'image/jpeg' }), 'GPS/empty.jpg'));
  entries.push(createFileCandidate(makeFile('bad.txt', 'text/plain'), 'GPS/bad.txt'));
  entries.push(createFileCandidate(makeFile('photo1.jpg'), 'GPS/photo1.jpg'));
  const result = prepareFolderImport(entries, { folderName: 'GPS', foundFiles: entries.length });
  assert.equal(result.report.addedPhotos, MAX_PHOTOS);
  assert.equal(result.report.skippedFiles, entries.length - MAX_PHOTOS);
  assert.equal(reasonCount(result.report, FILE_SKIP_REASONS.LIMIT), 2);
  assert.equal(reasonCount(result.report, FILE_SKIP_REASONS.EMPTY), 1);
  assert.equal(reasonCount(result.report, FILE_SKIP_REASONS.UNSUPPORTED), 1);
  assert.equal(reasonCount(result.report, FILE_SKIP_REASONS.DUPLICATE), 1);
}

// 11. Capability detection supports fallback without showDirectoryPicker.
{
  const capabilities = getFolderPickerCapabilities(
    {},
    { createElement: () => ({ type: 'file', webkitdirectory: false }) },
  );
  assert.equal(capabilities.showDirectoryPicker, false);
  assert.equal(capabilities.webkitDirectory, true);
  const noFolderCapabilities = getFolderPickerCapabilities({}, { createElement: () => ({ type: 'file' }) });
  assert.equal(noFolderCapabilities.webkitDirectory, false);
}

// 12. Read errors from a directory handle are reported without failing the whole folder.
{
  const badHandle = {
    name: 'Broken folder',
    kind: 'directory',
    async *entries() {
      yield ['broken.jpg', {
        kind: 'file',
        async getFile() { throw new Error('permission revoked'); },
      }];
    },
  };
  const result = await prepareFolderImportFromDirectoryHandle(badHandle);
  assert.equal(result.report.foundFiles, 1);
  assert.equal(result.report.addedPhotos, 0);
  assert.equal(reasonCount(result.report, FILE_SKIP_REASONS.READ_ERROR), 1);
}

// 13. Ordinary file input still validates and buffers multiple photos.
{
  const ordinary = [makeFile('one.jpg'), makeFile('two.png', 'image/png')];
  const validation = validateSelectedFiles(ordinary);
  assert.equal(validation.validFiles.length, 2);
  const buffered = await bufferSelectedFiles(ordinary, {
    thumbnailFactory: async (file) => `data:${file.type};base64,${file.name}`,
  });
  assert.deepEqual(buffered.bufferedFiles.map((file) => file.originalName), ['one.jpg', 'two.png']);
  assert.deepEqual(buffered.bufferedFiles.map((file) => file.relativePath), ['', '']);
  assert.ok(buffered.bufferedFiles.every((file) => file.stableFile instanceof File));
}

// Large synthetic folder: 300 files, nested paths, unsupported files and no mass concurrent reads.
{
  const entries = Array.from({ length: 300 }, (_, index) => {
    const folder = `GPS/day${(index % 5) + 1}/segment${(index % 3) + 1}`;
    const unsupported = index % 5 === 0;
    return createFileCandidate(
      makeFile(`photo${index + 1}.${unsupported ? 'txt' : 'jpg'}`, unsupported ? 'text/plain' : 'image/jpeg'),
      `${folder}/photo${index + 1}.${unsupported ? 'txt' : 'jpg'}`,
    );
  });
  const result = prepareFolderImport(entries, { folderName: 'GPS', foundFiles: entries.length, nestedFolders: 15 });
  assert.equal(result.report.foundFiles, 300);
  assert.equal(result.files.length, MAX_PHOTOS);
  assert.equal(reasonCount(result.report, FILE_SKIP_REASONS.UNSUPPORTED), 60);
  assert.equal(reasonCount(result.report, FILE_SKIP_REASONS.LIMIT), 220);
  assert.equal(result.report.nestedFolders, 15);

  let activeReads = 0;
  let maxActiveReads = 0;
  const slowFiles = Array.from({ length: MAX_PHOTOS }, (_, index) => ({
    name: `copy-${index + 1}.jpg`,
    type: 'image/jpeg',
    size: 4,
    lastModified: index + 1,
    async arrayBuffer() {
      activeReads += 1;
      maxActiveReads = Math.max(maxActiveReads, activeReads);
      await new Promise((resolve) => setTimeout(resolve, 2));
      activeReads -= 1;
      return bytes(4).buffer;
    },
  }));
  await bufferSelectedFiles(slowFiles, {
    copyConcurrency: 2,
    thumbnailFactory: async () => null,
  });
  assert.equal(maxActiveReads <= 2, true);
}

// Natural path sort works on full relative paths, not lastModified.
{
  const sorted = sortFileCandidates([
    createFileCandidate(makeFile('photo10.jpg'), 'GPS/part2/photo10.jpg'),
    createFileCandidate(makeFile('photo2.jpg'), 'GPS/part2/photo2.jpg'),
    createFileCandidate(makeFile('photo1.jpg'), 'GPS/part10/photo1.jpg'),
  ]).map((item) => item.relativePath);
  assert.deepEqual(sorted, [
    'GPS/part2/photo2.jpg',
    'GPS/part2/photo10.jpg',
    'GPS/part10/photo1.jpg',
  ]);
}

console.log('Folder picker tests passed');
