# GrapheneOS folder import compatibility

Android browsers can expose `showDirectoryPicker()` while their Android Storage Access Framework bridge still fails every `FileSystemFileHandle.getFile()` call. The application therefore prefers `<input type="file" webkitdirectory>` on Android and keeps `showDirectoryPicker()` for desktop browsers. If a directory-handle import sees files but cannot read any of them, the UI offers a compatible retry button.
