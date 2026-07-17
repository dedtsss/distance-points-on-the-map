import { useRef, useState } from 'react';
import { MAX_PHOTOS } from '../features/files/fileValidation.js';
import { formatFileSize } from '../utils/format.js';
import Icon from './Icon.jsx';

export default function UploadDropzone({
  photos,
  isBusy,
  isBuffering,
  onFiles,
  onOpenSettings,
}) {
  const inputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  const totalSize = photos.reduce((sum, photo) => sum + (Number(photo.size) || 0), 0);

  const submitFiles = (files) => {
    const selected = Array.from(files || []);
    if (selected.length > 0) onFiles(selected);
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
        if (!isBusy) submitFiles(event.dataTransfer.files);
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
      <div className="dropzone-icon" aria-hidden="true">
        <Icon name={isBuffering ? 'clock' : 'upload'} size={34} />
      </div>
      <div className="dropzone-copy">
        <h3>{isBuffering ? 'Подготовка файлов' : 'Перетащите фотографии сюда'}</h3>
        <p>JPG, PNG, WebP. До {MAX_PHOTOS} файлов за раз. Лимит размера приложением не задан.</p>
      </div>
      <div className="dropzone-actions">
        <button type="button" onClick={() => inputRef.current?.click()} disabled={isBusy}>
          <Icon name="plus" size={18} />
          Выбрать файлы
        </button>
        <button type="button" className="button-secondary" onClick={onOpenSettings}>
          <Icon name="tune" size={18} />
          Параметры проверки
        </button>
      </div>
      <div className="dropzone-meta" aria-live="polite">
        <span>{photos.length} выбрано</span>
        <span>{formatFileSize(totalSize)}</span>
      </div>
    </section>
  );
}
