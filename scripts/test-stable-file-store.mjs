import assert from 'node:assert/strict';
import { bufferSelectedFiles, createStableFileCopy } from '../src/features/files/stableFileStore.js';

const original = new File([new Uint8Array([1, 2, 3, 4])], 'Фото с GPS.jpg', { type: 'image/jpeg' });
let originalReads = 0;
const source = {
  name: original.name,
  type: original.type,
  size: original.size,
  async arrayBuffer() {
    originalReads += 1;
    return original.arrayBuffer();
  },
};

const copy = await createStableFileCopy(source, 0);
source.arrayBuffer = async () => { throw new Error('picker handle expired'); };

assert.equal(originalReads, 1);
assert.ok(copy.stableFile instanceof File);
assert.ok(copy.stableBlob instanceof Blob);
assert.notEqual(copy.stableFile, original);
assert.equal(copy.stableFile.name, 'Фото-с-GPS.jpg');
assert.deepEqual([...new Uint8Array(await copy.stableFile.arrayBuffer())], [1, 2, 3, 4]);
assert.equal(copy.sourceBuffer.byteLength, 4);

const noMime = await createStableFileCopy({
  name: 'android-picker.jpeg',
  type: '',
  size: 2,
  arrayBuffer: async () => new Uint8Array([0xff, 0xd8]).buffer,
});
assert.equal(noMime.stableFile.type, 'image/jpeg');

const folderFile = new File(['folder'], 'photo2.jpg', { type: 'image/jpeg' });
const folderCopy = await createStableFileCopy({ file: folderFile, relativePath: 'GPS object 15/day2/photo2.jpg' }, 1);
assert.equal(folderCopy.relativePath, 'GPS object 15/day2/photo2.jpg');
assert.equal(folderCopy.originalName, 'photo2.jpg');

const thumbnailOrder = [];
const buffered = await bufferSelectedFiles([
  new File(['one'], 'one.jpg', { type: 'image/jpeg' }),
  new File(['two'], 'two.jpg', { type: 'image/jpeg' }),
  new File(['three'], 'three.jpg', { type: 'image/jpeg' }),
], {
  thumbnailFactory: async (file) => {
    thumbnailOrder.push(file.name);
    return `data:image/jpeg;base64,${file.name}`;
  },
});
assert.deepEqual(buffered.bufferedFiles.map((file) => file.originalName), ['one.jpg', 'two.jpg', 'three.jpg']);
assert.deepEqual(thumbnailOrder, ['one.jpg', 'two.jpg', 'three.jpg']);
assert.equal(buffered.bufferedFiles[1].thumbnailDataUrl, 'data:image/jpeg;base64,two.jpg');

console.log('Stable file store tests passed');
