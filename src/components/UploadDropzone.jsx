import { useEffect, useRef, useState } from 'react';
import {
  FOLDER_HELP_TEXT,
  getFolderPickerCapabilities,
} from '../features/files/folderPicker.js';
import {
  FOLDER_PICKER_STRATEGIES,
  chooseFolderPickerStrategy,
} from '../features/files/folderPickerStrategy.js';
import { MAX_PHOTOS } from '../features/files/fileValidation.js';
import { formatFileSize } from '../utils/format.js';
import FolderImportSummary from './FolderImportSummary.jsx';
import Icon from './Icon.jsx';

export default function UploadDropzone({
  photos,
  isBusy,
  isBuffering,
  onFiles,
  onFolderFiles,
  onPickFolder,
  onDropItems,
  onCancelFolderImport,
  onOpenSettings,
  folderImport,
}) {
  const inputRef = useRef(null);
  const folderInputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  const [folderCapabilities, setFolderCapabilities] = useState(() => getFolderPickerCapabilities());
  const totalSize = photos.reduce((sum, photo) => sum + (Number(photo.size) || 0), 0);
  const folderPickerStrategy = chooseFolderPickerStrategy(folderCapabilities);
  const folderAvailable = folderPickerStrategy !== FOLDER_PICKER_STRATEGIES.NONE;

  useEffect(() => {
    setFolderCapabilities(getFolderPickerCapabilities());
  }, []);

  useEffect(() => {
    const input = folderInputRef.current;
    if (!input) return;
    input.webkitdirectory = true;
    input.directory = true;
    input.setAttribute('webkitdirectory', '');
    input.setAttribute('directory', '');
  }, []);

  const submitFiles = (files) => {
    const selected = Array.from(files || []);
    if (selected.length > 0) onFiles(selected);
  };

  const submitFolderFiles = (files) => {
    const selected = Array.from(files || []);
    onFolderFiles?.(selected);
  };

  const pickFolderWithDirectoryInput = () => folderInputRef.current?.click();

  const pickFolder = () => {
    if (folderPickerStrategy === FOLDER_PICKER_STRATEGIES.DIRECTORY_INPUT) {
      pickFolderWithDirectoryInput();
      return;
    }
    if (folderPickerStrategy === FOLDER_PICKER_STRATEGIES.DIRECTORY_HANDLE) {
      onPickFolder?.();
    }
  };

  return (
    <section
      className={`upload-dropzone${dragActive ? ' is-dragging' : ''}${isBusy ? ' is-disabled' : ''}`}
      onDragEnter={(event) => {
        event.preventDefault();
        if (!isBusy) setDragActive(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (!isBusy) event.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        setDragActive(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragActive(false);
        if (isBusy) return;
        const dataTransfer = event.dataTransfer;
        Promise.resolve(onDropItems?.(dataTransfer)).then((handled) => {
          if (!handled) submitFiles(dataTransfer.files);
        });
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        multiple
        onChange={(event) => {
          submitFiles(event.target.files);
          event.target.value = '';
        }}
        disabled={isBusy}
        aria-label="Выбрать фотографии для проверки"
      />
      <input
        ref={folderInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(event) => {
          submitFolderFiles(event.target.files);
          event.target.value = '';
        }}
        disabled={isBusy || !folderCapabilities.webkitDirectory}
        aria-label="Выбрать папку с фотографиями"
      />
      <div className="dropzone-icon" aria-hidden="true">
        <Icon name={isBuffering ? 'clock' : 'upload'} size={34} />
      </div>
      <div className="dropzone-copy">
        <h3>{isBuffering ? 'Подготовка файлов' : 'Перетащите фотографии сюда'}</h3>
        <p>JPG, PNG, WebP. До {MAX_PHOTOS} файлов за раз. Лимит размера приложением не задан.</p>
        <p className="folder-picker-help">{FOLDER_HELP_TEXT}</p>
      </div>
      <div className="dropzone-actions">
        <button type="button" onClick={() => inputRef.current?.click()} disabled={isBusy}>
          <Icon name="plus" size={18} />
          Выбрать фотографии
        </button>
        {folderAvailable && (
          <button type="button" className="button-secondary" onClick={pickFolder} disabled={isBusy}>
            <Icon name="folder" size={18} />
            Выбрать папку
          </button>
        )}
        <button type="button" className="button-secondary" onClick={onOpenSettings}>
          <Icon name="tune" size={18} />
          Параметры проверки
        </button>
      </div>
      <FolderImportSummary
        status={folderImport?.status}
        report={folderImport?.report}
        error={folderImport?.error}
        onCancel={onCancelFolderImport}
        onCompatibilityPick={folderCapabilities.webkitDirectory ? pickFolderWithDirectoryInput : undefined}
      />
      <div className="dropzone-meta" aria-live="polite">
        <span>{photos.length} выбрано</span>
        <span>{formatFileSize(totalSize)}</span>
      </div>
    </section>
  );
}
