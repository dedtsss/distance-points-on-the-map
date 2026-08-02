export const FOLDER_PICKER_STRATEGIES = Object.freeze({
  DIRECTORY_HANDLE: 'directory-handle',
  DIRECTORY_INPUT: 'directory-input',
  NONE: 'none',
});

export function isAndroidUserAgent(userAgent = '') {
  return /Android/i.test(String(userAgent || ''));
}

export function chooseFolderPickerStrategy(
  capabilities = {},
  userAgent = globalThis.navigator?.userAgent || '',
) {
  const hasDirectoryHandle = Boolean(capabilities.showDirectoryPicker);
  const hasDirectoryInput = Boolean(capabilities.webkitDirectory);

  // Chromium on Android routes showDirectoryPicker() through Android SAF.
  // Some Android/GrapheneOS combinations can enumerate file handles but then
  // fail every getFile() call. The directory input returns File objects
  // directly and is the more compatible route on mobile.
  if (hasDirectoryInput && isAndroidUserAgent(userAgent)) {
    return FOLDER_PICKER_STRATEGIES.DIRECTORY_INPUT;
  }

  if (hasDirectoryHandle) return FOLDER_PICKER_STRATEGIES.DIRECTORY_HANDLE;
  if (hasDirectoryInput) return FOLDER_PICKER_STRATEGIES.DIRECTORY_INPUT;
  return FOLDER_PICKER_STRATEGIES.NONE;
}
