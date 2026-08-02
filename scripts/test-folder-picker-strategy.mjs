import assert from 'node:assert/strict';
import {
  FOLDER_PICKER_STRATEGIES,
  chooseFolderPickerStrategy,
  isAndroidUserAgent,
} from '../src/features/files/folderPickerStrategy.js';

assert.equal(isAndroidUserAgent('Mozilla/5.0 (Linux; Android 16)'), true);
assert.equal(isAndroidUserAgent('Mozilla/5.0 (Windows NT 10.0)'), false);

const both = { showDirectoryPicker: true, webkitDirectory: true };
assert.equal(
  chooseFolderPickerStrategy(both, 'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/150 Mobile'),
  FOLDER_PICKER_STRATEGIES.DIRECTORY_INPUT,
);
assert.equal(
  chooseFolderPickerStrategy(both, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/150'),
  FOLDER_PICKER_STRATEGIES.DIRECTORY_HANDLE,
);
assert.equal(
  chooseFolderPickerStrategy({ showDirectoryPicker: false, webkitDirectory: true }, 'Desktop'),
  FOLDER_PICKER_STRATEGIES.DIRECTORY_INPUT,
);
assert.equal(
  chooseFolderPickerStrategy({}, 'Android'),
  FOLDER_PICKER_STRATEGIES.NONE,
);

console.log('Folder picker strategy tests passed');
